import fs from 'fs';
import path from 'path';
import md5File from 'md5-file';
import {parseYaml} from "../client/utils/yaml";
import {promisify} from 'util';
import {AppID, AppIDList, AppTopLevelConfiguration, BuildID, LoadedConfig, LoadedPage, rawAllDBConfigSchema, rawAppConfigSchema, RawBuildConfig, RawDefaultBuildConfig, rawDefaultBuildConfigSchema, rawLangConfigSchema, rawMenuConfigSchema, ReturnedFinalConfig, returnedFinalConfigSchema} from "../client/configHandler/zodConfigTypes";
import {FINAL_CONFIG_JSON_FILENAME, FINAL_CONFIG_LOCAL_DIR} from "../client/constants";
import {PrecacheEntry} from 'workbox-precaching/_types';
import {getRecordEntries, runningInJest} from '../client/utils';
import {DBConfig} from '../client/types/config';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const opendir = promisify(fs.opendir);

// TODO(high): check that all referenced files in public actually exist
// TODO(high): ensure that directory names are alphanumeric and underscore only
// TODO(high): use webpack to generate this, instead of .env.local
// TODO(high): once using webpack, generate the json filenames with md5sum included in the filename, and use it when fetching them? certainly include the md5sum in the main fetch, since that isn't happening now
const ENV_FILE = '.env.local';
const ENV_FILE_HEADER = '# NOTE: This file is generated automatically by compileYaml.ts! ' +
    'Changes here will be overwritten during the build process.';
const CONFIG_DIR = 'src/config/';

const PUBLIC_DIR_PREFIX = 'public/';

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
    "build.yml": {
        type: "defaultBuildConfig",
        schema: rawDefaultBuildConfigSchema,
    },
    "menu.yml": {
        type: "menuConfig",
        schema: rawMenuConfigSchema,
    }
} as const;

interface LKFMeta {
    idChain: string[],
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
        const dialect = filename.replace(/.md$/, "")
        if (subdirs.length > 2) {
            console.error(`Markdown file too deeply nested! Unsure how to handle: "${path}"`)
            return null;
        }
        return {
            type: "page",
            meta: {
                idChain: [...subdirs, dialect],
            },
            page: {
                dialect,
                pageID: subdirs[0],
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
        //const parsed = m.schema.parse(yamlBlob);
        //NOTE: parsing/validation no longer happens here, it's done after everything is loaded so that we
        //      get paths. if a return to this is desired, you just need to make sure this has a way to safeparse.
        const parsed = yamlBlob as ReturnType<typeof m.schema.parse>;

        // TODO: remove as
        return {
            configType: m.type,
            config: parsed,
        } as LoadedConfig;
    } else {
        console.log(`Unknown yaml filename, ignoring: "${filename}"`);
        return null;
    }
}

// TODO: flatten out ".config" and just use discriminated unions (will greatly simplify parsing and accessing)
// TODO: separate out parsing logic for "default", since it's not just apps
export async function rawParseAppYaml(localPrefix: string, appID: "default" | AppID): Promise<any> {
    if (!runningInJest()) {
        console.log(`Building app "${appID}"...`);
    }

    const output: any = {
        appID,
        pages: {},
        configs: {},
    };

    // TODO: XXX: move this into its own function (and then parse as app separately?)
    if (appID === "default") {
        const buildDir = path.join(CONFIG_DIR, "default", "build.yml");
        const lkfPlusMeta = await handleFile(buildDir, "build.yml", []);

        if (lkfPlusMeta?.type === "config") {
            output.build = lkfPlusMeta.conf;
        } else {
            console.log(lkfPlusMeta);
            throw new Error("Error loading default build.yml!");
        }
    }

    // TODO: ensure CONFIG_DIR + localPrefix + appID is a valid path
    const appDir = path.join(CONFIG_DIR, localPrefix, appID);

    for await (const obj of walkFileTree(appDir, [])) {
        if (obj === null) {
            continue;
        }
        if (obj.type === "page") {
            output.pages[obj.page.pageID] = obj.page;
        } else if (obj.type === "config") {
            output.configs[obj.conf.configType] = obj.conf;
        }
    }

    return output;
}

async function loadBuildYaml(buildID: BuildID, path: string): Promise<any> {
    const yamlText = (await readFile(path)).toString();
    const yamlBlob: any = parseYaml(yamlText);
    yamlBlob.buildID = buildID;
    return yamlBlob;
}

export async function rawParseBuildYaml(localPrefix: string, buildID: BuildID): Promise<any> {
    if (!runningInJest()) {
        console.log(`Building build ${buildID}...`);
    }

    // TODO: ensure is a valid path
    const fileName = `${buildID}/build.yml`;
    const buildPath = path.join(CONFIG_DIR, localPrefix, fileName);

    return await loadBuildYaml(buildID, buildPath);
}

export interface GLFCOpts {
    buildID?: BuildID,
    appIDs?: AppIDList,
}

export async function genLoadFinalConfigWILLTHROW(opts?: GLFCOpts): Promise<ReturnedFinalConfig> {
    const {buildID, appIDs} = opts ?? {};
    const generatedFinalConfigAttempt = await genLoadFinalConfigAttemptINTERNAL({buildID, appIDs});
    return returnedFinalConfigSchema.parse(generatedFinalConfigAttempt);
}

export async function genLoadFinalConfigSafe(opts?: GLFCOpts): Promise<ReturnType<typeof returnedFinalConfigSchema.safeParse>> {
    const {buildID, appIDs} = opts ?? {};
    const generatedFinalConfigAttempt = await genLoadFinalConfigAttemptINTERNAL({buildID, appIDs});
    return returnedFinalConfigSchema.safeParse(generatedFinalConfigAttempt);
}

// NOTE: this function returns what it thinks is a ReturnedFinalConfig, but because the yaml parsing functions return "any", we don't try to say that we have an RFC until it is parsed via zod above.
async function genLoadFinalConfigAttemptINTERNAL(opts: GLFCOpts): Promise<any> {
    const {buildID} = opts;
    const appIDsOverride = opts.appIDs;

    const rawdef = await rawParseAppYaml("", "default");

    const buildConfig: RawBuildConfig = buildID === undefined
        ? undefined :
        await rawParseBuildYaml("builds/", buildID);

    let appIDsOrAll: [AppID, ...AppID[]] | "all" = appIDsOverride ??
        buildConfig?.apps ??
        rawdef.build.config.apps;

    let appIDs: [AppID, ...AppID[]];
    // TODO: walk the app dir and get all app names
    // TODO: test that this happens
    if (appIDsOrAll === "all") {
        throw new Error("allmode is not yet implemented!");
        // appIDs = walkAppDirAndGetAllAppIDs();
    } else {
        appIDs = Array.from(new Set(appIDsOrAll)) as [AppID, ...AppID[]];
    }

    const apps: AppTopLevelConfiguration[] = await Promise.all(appIDs.map(async (appID: string) => {
        const rawapp = await rawParseAppYaml("apps/", appID);
        return rawapp;
    }));
    const appEntries: [AppID, AppTopLevelConfiguration][] = apps.map((a) => ([a.appID, a]));

    const generatedFinalConfigAttempt: ReturnedFinalConfig = {
        default: rawdef,
        appConfigs: Object.fromEntries(appEntries),
        buildConfig: buildConfig,
    };

    if (appIDsOverride !== undefined) {
        generatedFinalConfigAttempt.debug = {
            appIDsOverride,
        };
    }
    return generatedFinalConfigAttempt;
}

export function getFilesToCache(finalObj: ReturnedFinalConfig): string[] {
    const filesToCache = [];
    for (const appName in finalObj.appConfigs) {
        const allAppConfigs = finalObj.appConfigs[appName];
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

function getPublicPrefixes(filename: string): {withPublicPrefix: string, noPublicPrefix: string} {
    let withPublicPrefix = filename;
    if (!filename.startsWith(PUBLIC_DIR_PREFIX)) {
        withPublicPrefix = PUBLIC_DIR_PREFIX + filename;
    }
    const noPublicPrefix = withPublicPrefix.slice(PUBLIC_DIR_PREFIX.length);
    return {withPublicPrefix, noPublicPrefix};
}

export async function genPrecacheEntries(filenames: string[]): Promise<PrecacheEntry[]> {
    return Promise.all(filenames.map(async (filename) => {
        const {withPublicPrefix, noPublicPrefix} = getPublicPrefixes(filename);
        return md5File(withPublicPrefix).then((md5sum) => {
            const entry: PrecacheEntry = {
                url: noPublicPrefix,
                revision: md5sum,
            };
            return entry;
        });
    }));
}

async function genLocalURLWithMD5Version(filename: string): Promise<string> {
    const {withPublicPrefix, noPublicPrefix} = getPublicPrefixes(filename);

    if (runningInJest()) {
        return `${noPublicPrefix}?v=${noPublicPrefix}_MD5`;
    }

    return md5File(withPublicPrefix).then((md5sum) => {
        return `${noPublicPrefix}?v=${md5sum}`;
    });
}

export type IndexHtmlEnvVarPairs = {
    REACT_APP_LIBURRY_HTML_TITLE: string,
    REACT_APP_LIBURRY_HTML_THEME_COLOR: string,
    REACT_APP_LIBURRY_HTML_OG_TITLE: string,
    REACT_APP_LIBURRY_HTML_OG_IMAGE: string,
    REACT_APP_LIBURRY_HTML_OG_DESCRIPTION: string,
    REACT_APP_LIBURRY_WEBMANIFEST_PATH: string,
    REACT_APP_LIBURRY_FAVICON_PATH: string,
} & IndexHtmlEnvVarPairsOptionals;

interface IndexHtmlEnvVarPairsOptionals {
    REACT_APP_LIBURRY_HTML_NOSCRIPT_ADDENDUM?: string,
}

export async function genIndexHTMLEnvVarPairs(
    defaultBuildConfig: RawDefaultBuildConfig,
    buildConfig?: RawBuildConfig,
): Promise<IndexHtmlEnvVarPairs> {
    // TODO: recursively overwrite defaultconfig with buildconfig
    // TODO: read in configs

    const displayName = buildConfig?.displayName ?? defaultBuildConfig.displayName;
    const themeColor = buildConfig?.indexHtml?.themeColor ?? defaultBuildConfig.indexHtml.themeColor;

    // NOTE: if the build has a displayName, use that for og:title before falling back to the default buildconfig
    // //TODO: UNIT TEST
    const title = buildConfig?.indexHtml?.og?.title ??
        buildConfig?.displayName ??
        defaultBuildConfig.indexHtml.og.title;
    const imageFullURL = buildConfig?.indexHtml?.og?.imageFullURL ?? defaultBuildConfig.indexHtml.og.imageFullURL;
    const description = buildConfig?.indexHtml?.og?.description ?? defaultBuildConfig.indexHtml.og.description;

    const manifestUNFINISHED = buildConfig?.indexHtml?.manifest ?? defaultBuildConfig.indexHtml.manifest;
    const manifest = await genLocalURLWithMD5Version(manifestUNFINISHED);
    const favicon = buildConfig?.indexHtml?.favicon ?? defaultBuildConfig.indexHtml.favicon;

    const noscript = buildConfig?.indexHtml?.noscript;

    const optionals: IndexHtmlEnvVarPairsOptionals = {};
    if (noscript !== undefined) {
        optionals.REACT_APP_LIBURRY_HTML_NOSCRIPT_ADDENDUM = noscript;
    }

    return {
        REACT_APP_LIBURRY_HTML_TITLE: displayName,
        REACT_APP_LIBURRY_HTML_THEME_COLOR: themeColor,
        REACT_APP_LIBURRY_HTML_OG_TITLE: title,
        REACT_APP_LIBURRY_HTML_OG_IMAGE: imageFullURL,
        REACT_APP_LIBURRY_HTML_OG_DESCRIPTION: description,
        REACT_APP_LIBURRY_WEBMANIFEST_PATH: manifest,
        REACT_APP_LIBURRY_FAVICON_PATH: favicon,
        ...optionals,
    };

}

export function makeEnvFileEntry(varname: string, value: string) {
    // The env file is newline-delimited, so don't allow values to be passed in
    const noNewlinesValue = value.replace(/[\n\r]/g, '');
    return `${varname}=${noNewlinesValue}\n`;
}

export async function genWriteEnvFile(envFileBody: string) {
    const output = `${ENV_FILE_HEADER}\n${envFileBody}`;

    return await writeFile(ENV_FILE, output).then(
        () => console.log(`* Wrote out "${ENV_FILE}"...`));
}

export async function genWriteFinalConfig(jsonString: string) {
    return await writeFile(path.join(PUBLIC_DIR_PREFIX, FINAL_CONFIG_LOCAL_DIR, FINAL_CONFIG_JSON_FILENAME), jsonString).then(
        () => console.log(`* Wrote out "${FINAL_CONFIG_LOCAL_DIR}"...`));
}
