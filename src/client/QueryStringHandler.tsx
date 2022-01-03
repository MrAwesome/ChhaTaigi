import qs from "qs";
import OptionsChangeableByUser from "./ChhaTaigiOptions";
import {PageID} from "./configHandler/zodConfigTypes";
import {SearcherType} from "./search/searchers/Searcher";
import {MainDisplayAreaMode} from "./types/displayTypes";
import {getRecordEntries, noop} from "./utils";
import {TypeEquals} from "./utils/typeEquality";

// TODO: fix double-back being necessary
// TODO: allow for bundled updates
// TODO: cache values for faster checking (check browser state?)

// HACK to allow web worker loader to work:
// https://github.com/pmmmwh/react-refresh-webpack-plugin/issues/24#issuecomment-672853561
(global as any).$RefreshReg$ = () => {};
(global as any).$RefreshSig$$ = () => () => {};

// These are the actual fields used/set in the hash
const QUERY = "q";
const MODE = "m";
const PAGE = "p";
const DEBUG = "debug";
const SEARCHER = "searcher";
const PLAYGROUND = "playground";
const APP = "app";
const SUBAPP = "subapp";

const FIELDTYPE_TO_FIELDKEY_MAPPING = {
    savedQuery: QUERY,
    mainMode: MODE,
    pageID: PAGE,
    debug: DEBUG,
    searcherType: SEARCHER,
    playground: PLAYGROUND,
    appID: APP,
    subAppID: SUBAPP,
} as const;

export type QueryStringFieldType = keyof typeof FIELDTYPE_TO_FIELDKEY_MAPPING;

const _optsSame: TypeEquals<keyof OptionsChangeableByUser, QueryStringFieldType> = true;
noop(_optsSame);

//type QueryStringActualKey = typeof FIELDTYPE_TO_FIELDKEY_MAPPING[QueryStringFieldType];


export type QSUpdateOpts = {
    modifyHistInPlace?: boolean
}

const QS_SORT_FN = (a: string, b: string) => {
    if (a === b) {
        return 0;
    } else if (a === QUERY) {
        return 1;
    } else if (b === QUERY) {
        return -1;
    } else {
        return a.localeCompare(b);
    }
};

const QS_PARSE_OPTS = {delimiter: ';'};
const QS_STRINGIFY_OPTS = {delimiter: ';', sort: QS_SORT_FN};

// TODO: make this take a partial object of desired updates to values, and have a single set and get
export default class QueryStringParser {
    private testString?: string;
    constructor(testString?: string) {
        this.testString = testString;
    }

    private getString(): string {
        return this.testString ?? window.location.hash.replace(/^#/, "");
    }

    private parseInternal() {
        return qs.parse(this.getString(), QS_PARSE_OPTS);
    }

    private stringifyInternal(parsed: qs.ParsedQs) {
        return qs.stringify(parsed, QS_STRINGIFY_OPTS);
    }

    // Used to create a history entry on load, so that the back button will load
    // the original state after typing.
    anchor() {
        if (window.history.length < 3) {
            this.update({});
        }
    }

    update(
        updates: Partial<OptionsChangeableByUser>,
        opts?: QSUpdateOpts,
    ) {
        //const oldHashString = this.getString();
        const parsed = this.parseInternal();

        getRecordEntries(updates).forEach(([fieldType, value]) => {
            const fieldKey = FIELDTYPE_TO_FIELDKEY_MAPPING[fieldType as QueryStringFieldType];

            // null for value is shorthand for "delete the field entirely".
            if (value === null) {
                delete parsed[fieldKey];
            } else {
                if (typeof value === "boolean") {
                    parsed[fieldKey] = value ? "true" : "false";
                } else {
                    parsed[fieldKey] = value;
                }
            }
        });

        const newHashString = this.stringifyInternal(parsed);

        if (this.testString) {
            this.testString = newHashString;
        } else {
            const args: [Object, string, string] = [parsed, '', "#" + newHashString];
            const shouldSave = !(opts?.modifyHistInPlace);
            if (shouldSave) {
                window.history.pushState(...args);

                // Prevent a second back button press being needed after saving an entry. (Since there's no pop state action when we detect a duplicate, and we have to push onto the stack to "save" an entry)
                // Doesn't seem to work :(
                // TODO: push early, when a "new search" is detected (typing *after* the timeout, or at the beginning, then modify that until the timeout is hit)
                //if (oldString === newHashString) {
                //window.history.back();
                //}
            } else {
                window.history.replaceState(...args);
            }
        }
    }

    parse(): OptionsChangeableByUser {
        let options = new OptionsChangeableByUser();
        const parsed = this.parseInternal();
        const query = parsed[QUERY];
        const searcher = parsed[SEARCHER];
        const appID = parsed[APP];
        const subAppID = parsed[SUBAPP];

        if (typeof query === "string") {
            options.savedQuery = query;
        }
        const mode = parsed[MODE];
        if (typeof mode === "string") {
            if (mode in MainDisplayAreaMode) {
                options.mainMode = mode as MainDisplayAreaMode;
            }
        }

        const pageID = parsed[PAGE];
        if (typeof pageID === "string") {
            options.pageID = pageID as PageID;
        }

        // TODO: abstract away this process
        options.debug = parsed[DEBUG] !== "false" && parsed[DEBUG] !== undefined;
        options.playground = parsed[PLAYGROUND] !== "false" && parsed[PLAYGROUND] !== undefined;

        if (typeof searcher === "string") {
            const searcherUpper = searcher.toUpperCase();
            if (searcherUpper in SearcherType) {
                options.searcherType = SearcherType[searcherUpper as keyof typeof SearcherType];
            }
        }

        if (typeof appID === "string") {
            options.appID = appID;
        }

        if (typeof subAppID === "string") {
            options.subAppID = subAppID;
        }

        return options;
    }
}
