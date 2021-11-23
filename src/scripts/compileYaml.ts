// A script to take our yaml configs and compile them into JSON blobs for reading by the site.
//
// NOTE: currently this compiles everything, including markdown pages, into a single huge JSON blob. This can easily be split up, including compiling the config for each known app separately.

import fs from 'fs';
import path from 'path';
import md5File from 'md5-file';
import {parseYaml} from "../utils/yaml";
import {promisify} from 'util';
import {AppID, LoadedConfig, LoadedPage, rawAllDBConfigSchema, rawAppConfigSchema, rawLangConfigSchema, rawMenuConfigSchema, ReturnedFinalConfig, returnedFinalConfigSchema} from "../configHandler/zodConfigTypes";
import {CHHA_APPNAME, FINAL_CONFIG_LOCAL_LOCATION} from "../constants";
import {PrecacheEntry} from 'workbox-precaching/_types';
import {getRecordEntries} from '../utils';
import {DBConfig} from '../types/config';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const opendir = promisify(fs.opendir);

const ENV_FILE = '.env.local';
const ENV_FILE_HEADER = '# NOTE: This file is generated automatically by compileYaml.ts! ' +
    'Changes here will be overwritten during the build process.';
const CONFIG_DIR = 'public/config/';

// TODO: DB filenames are currently stored in public/db/, but their filenames are prefixed with db/ in the configs - they should probably be stored per-app, unless sharing will be common
const PUBLIC_DIR_PREFIX = 'public/';
const CACHE_LINE_ENV_VARNAME = 'REACT_APP_CHHA_CACHE_FILES_JSON';

export const YAML_FILENAME_TO_SCHEMA_MAPPING = {
    "app.yml": {
        type: "appConfig",
        schema: rawAppConfigSchema,
    },
    "db.yml": {
        type: "dbConfig",
        schema: rawAllDBConfigSchema,
    },
    "lang.yml": {
        type: "langConfig",
        schema: rawLangConfigSchema,
    },
    "menu.yml": {
        type: "menuConfig",
        schema: rawMenuConfigSchema,
    }
} as const;

interface LKFMeta {
    idChain: string[],
    app: AppID,
}
type LoadedFilePlusMeta = {
    type: "config",
    conf: LoadedConfig,
    meta: LKFMeta,
} | {
    type: "page",
    page: LoadedPage,
    meta: LKFMeta,
};

export async function* walkFileTree(dir: string, subdirs: Array<string>): AsyncIterable<LoadedFilePlusMeta | null> {
    for await (const d of await opendir(dir)) {
        const entry = path.join(dir, d.name);
        if (d.isDirectory()) {
            yield* walkFileTree(entry, [...subdirs, d.name]);
        }
        else if (d.isFile()) {
            yield handleFile(entry, d.name, subdirs);
        }
    }
}

async function handleFile(path: string, filename: string, subdirs: Array<string>): Promise<LoadedFilePlusMeta | null> {
    if (path.endsWith('.yml')) {
        const yamlText = (await readFile(path)).toString();
        const id = filename.replace(/.yml$/, "")
        const yamlBlob: Object = parseYaml(yamlText);

        let validatedConfig: LoadedConfig | null = null;
        try {
            validatedConfig = validateYaml(filename, yamlBlob);
        } catch (e) {
            console.error(`Failed validating "${path}":`);
            throw e;
        }

        if (validatedConfig !== null) {
            return {
                type: "config",
                meta: {
                    app: subdirs[0],
                    idChain: [...subdirs, id],
                },
                conf: validatedConfig,
            };
        } else {
            console.warn(`Unknown yaml file type! Add it to YAML_FILENAME_TO_SCHEMA_MAPPING if it should be parsed: "${path}"`)
            return null;
        }
    } else if (path.endsWith('.md')) {
        const mdText = (await readFile(path)).toString();
        const lang = filename.replace(/.md$/, "")
        if (subdirs.length > 2) {
            console.error(`Markdown file too deeply nested! Unsure how to handle: "${path}"`)
            return null;
        }
        return {
            type: "page",
            meta: {
                app: subdirs[0],
                idChain: [...subdirs, lang],
            },
            page: {
                lang,
                pageID: subdirs[1],
                pageType: "markdown",
                mdText,
            }
        };
    } else {
        console.warn(`Unknown file type for: ${path}`);
        return null;
    }
}

export default function validateYaml(filename: string, yamlBlob: Object): LoadedConfig | null {
    if (filename in YAML_FILENAME_TO_SCHEMA_MAPPING) {
        const m = YAML_FILENAME_TO_SCHEMA_MAPPING[filename as keyof typeof YAML_FILENAME_TO_SCHEMA_MAPPING];
        // NOTE: could use safeparse instead. Just felt convenient.
        const parsed = m.schema.parse(yamlBlob);

        return {
            configType: m.type,
            config: parsed,
        } as LoadedConfig;
    } else {
        console.log(`Unknown yaml filename, ignoring: "${filename}"`);
        return null;
    }
}

export async function parseAllYaml(): Promise<any> {
    const appName = CHHA_APPNAME;
    console.log(`Building app ${appName}...`);

    // We use "any" here because we will validate using zod below once we've finished loading configs.
    const constructedObj: any = {
        apps: {},
    };

    for await (const obj of walkFileTree(CONFIG_DIR, [])) {
        if (obj === null) {
            continue;
        }
        if (!(obj.meta.app in constructedObj.apps)) {
            constructedObj.apps[obj.meta.app] = {
                pages: {},
                configs: {},
            };
        }
        const appObj = constructedObj.apps[obj.meta.app]!;
        if (obj.type === "page") {
            appObj.pages[obj.page.pageID] = obj.page;
        } else if (obj.type === "config") {
            appObj.configs[obj.conf.configType] = obj.conf;
        }
    }

    const trimmedObj: any = {apps: {}};

    if (!(appName in constructedObj.apps)) {
        throw new Error(`App "${appName}" not found! Check that you're setting the environment variable REACT_APP_CHHA_APPNAME correctly.`);
    }
    if (!("default" in constructedObj.apps)) {
        throw new Error(`No "default" configuration found! Check that the "default" directory exists in ${CONFIG_DIR}.`);
    }

    // NOTE: This is where we move "default" up a level in the configuration hierarchy.
    trimmedObj.default = constructedObj.apps["default"];
    trimmedObj.default.appID = "default";
    trimmedObj.apps[appName] = constructedObj.apps[appName];
    trimmedObj.apps[appName].appID = appName;

    return trimmedObj;
}

function getFilesToCache(finalObj: ReturnedFinalConfig): string[] {
    const filesToCache = [];
    for (const appName in finalObj.apps) {
        const allAppConfigs = finalObj.apps[appName];
        if (allAppConfigs === undefined) {
            throw new Error("Undefined appconfig: " + appName);
        }

        const {dbConfigs} = allAppConfigs.configs.dbConfig.config;

        for (const [dbIdentifier, rawDBConfig] of getRecordEntries(dbConfigs)) {
            const dbConfig = new DBConfig(dbIdentifier, rawDBConfig);

            const loadInfo = dbConfig.getDBLoadInfo();
            for (const key in loadInfo) {
                const validKey = key as keyof typeof loadInfo;
                if (key.startsWith("local")) {
                    const localFilename = loadInfo[validKey];
                    if (localFilename !== undefined) {
                        filesToCache.push(localFilename);
                    }
                }
            }
        }
    }
    return filesToCache;
}

async function genPrecacheEntries(filenames: string[]): Promise<PrecacheEntry[]> {
    return Promise.all(filenames.map(async (filename) => {
        let withPublicPrefix = filename;
        if (!filename.startsWith(PUBLIC_DIR_PREFIX)) {
            withPublicPrefix = PUBLIC_DIR_PREFIX + filename;
        }
        const noPublicPrefix = withPublicPrefix.slice(PUBLIC_DIR_PREFIX.length);
        return md5File(withPublicPrefix).then((md5sum) => {
            const entry: PrecacheEntry = {
                url: noPublicPrefix,
                revision: md5sum,
                //integrity: ,
            };
            return entry;
        });
    }));
}

function makeEnvFileEntry(varname: string, value: string) {
    // The env file is newline-delimited, so don't allow values to be passed in
    const noNewlinesValue = value.replace(/[\n\r]/g, '');
    return `${varname}=${noNewlinesValue}\n`;
}

async function genWriteEnvFile(envFileBody: string) {
    const output = `${ENV_FILE_HEADER}\n${envFileBody}`;

    writeFile(ENV_FILE, output).then(
        () => console.log(`* Wrote out "${ENV_FILE}"...`));
}

async function genWriteFinalConfig(jsonString: string) {
    writeFile(PUBLIC_DIR_PREFIX + FINAL_CONFIG_LOCAL_LOCATION, jsonString).then(
        () => console.log(`* Wrote out "${FINAL_CONFIG_LOCAL_LOCATION}"...`));
}

(async function () {
    // TODO: abstract away
    if (!fs.existsSync("public/generated")) {
        fs.mkdirSync("public/generated");
    }

    const generatedFinalConfig = await parseAllYaml();
    const checkedFinalConfig: ReturnedFinalConfig = returnedFinalConfigSchema.parse(generatedFinalConfig);

    // This must be written before the env file, since we generate an md5sum of the json file for precaching
    const finalObjJsonString = JSON.stringify(checkedFinalConfig);
    await genWriteFinalConfig(finalObjJsonString);

    const filesToCache = [
        ...getFilesToCache(checkedFinalConfig),
        FINAL_CONFIG_LOCAL_LOCATION
    ];
    const precacheEntries = await genPrecacheEntries(filesToCache);
    const precacheEntriesJsonString = JSON.stringify(precacheEntries);
    const envFileOutputText = makeEnvFileEntry(CACHE_LINE_ENV_VARNAME, precacheEntriesJsonString);

    await genWriteEnvFile(envFileOutputText);
}());

// NOTE: if you don't mind locking into the app model, everything you want to read from the config can be passed in via env vars, and you don't have to bother with the fullconfiguration at all (or it can even be in an env var (check max length of env vars))
