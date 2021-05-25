import {getWorkerDebugConsole, StubConsole} from "./debug_console";
import type {LangDB, DBName, PerDictResults} from "./types";
import type {FuzzySearchableDict} from "./fuzzySortTypes";
import {fetchDB} from "./dictionary_handling";
import {OngoingSearch} from "./search";
import {fuzzysortSearch} from "./fuzzySortUtils";

// eslint-disable-next-line no-restricted-globals
const ctx: Worker = self as any;

enum WorkerInitState {
    UNINITIALIZED,
    STARTED,
    LOADED,
    SEARCHING,
}

export type SearchWorkerCommandMessage =
    {command: "INIT", payload: {dbName: DBName, langDB: LangDB, debug: boolean}} |
    {command: "LOAD_DB", payload?: null} |
    {command: "SEARCH", payload: {query: string, searchID: number}} |
    {command: "CANCEL", payload?: null} |
    {command: "LOG", payload?: null};

export type SearchWorkerResponseMessage =
    {
        resultType: "SEARCH_SUCCESS",
        payload: {dbName: DBName, query: string, results: PerDictResults, searchID: number}
    } |
    {
        resultType: "SEARCH_FAILURE",
        payload: {dbName: DBName, query: string, searchID: number}
    } |
    {
        resultType: "DB_LOAD_SUCCESS",
        payload: {dbName: DBName}
    };

type WorkerInitializedState =
    {init: WorkerInitState.UNINITIALIZED} |
    {init: WorkerInitState.STARTED, dbName: DBName, langDB: LangDB} |
    {init: WorkerInitState.LOADED, dbName: DBName, langDB: LangDB, db: FuzzySearchableDict} |
    {init: WorkerInitState.SEARCHING, dbName: DBName, langDB: LangDB, db: FuzzySearchableDict, ogs: OngoingSearch};

class SearchWorkerHelper {
    state: WorkerInitializedState = {init: WorkerInitState.UNINITIALIZED};
    debug: boolean = false;
    console: StubConsole = getWorkerDebugConsole(false);

    start(dbName: DBName, langDB: LangDB, debug: boolean) {
        this.state = {init: WorkerInitState.STARTED, dbName, langDB};
        this.console = getWorkerDebugConsole(debug);
        this.debug = debug;
        // TODO: send message back for start, to avoid race?
    }

    private sendResponse(message: SearchWorkerResponseMessage) {
        ctx.postMessage(message);
    }

    loadDB() {
        if (this.state.init === WorkerInitState.STARTED) {
            const dbName = this.state.dbName;
            const langDB = this.state.langDB;
            fetchDB(dbName, langDB, this.debug).then(
                (searchableDict) => {
                    this.state = {init: WorkerInitState.LOADED, db: searchableDict, dbName, langDB};
                    this.sendResponse({resultType: "DB_LOAD_SUCCESS", payload: {dbName}});
                });
        } else {
            this.log();
            console.error("Attempted to load db before worker initialization!")
        }
    }


    // TODO: replace postMessage with function taking typed union
    search(query: string, searchID: number) {
        switch (this.state.init) {
            case WorkerInitState.SEARCHING:
                this.cancel();
                this.search(query, searchID);
                break;
            case WorkerInitState.LOADED:
                const ongoingSearch = fuzzysortSearch(this.state.db, query, this.debug);
                const dbName = this.state.dbName;
                if (ongoingSearch !== null) {
                    const originalState = this.state;
                    this.state = {...originalState, init: WorkerInitState.SEARCHING, ogs: ongoingSearch};
                    ongoingSearch.parsePromise?.then((results) => {
                        if (results === null) {
                            this.sendResponse({resultType: "SEARCH_FAILURE", payload: {query, dbName, searchID}});
                        } else {
                            this.sendResponse({resultType: "SEARCH_SUCCESS", payload: {query, results, dbName, searchID}});
                        }
                        this.state = originalState;
                    });
                }
                break;
            case WorkerInitState.STARTED:
                this.log();
                console.warn("Attempted to search db before load!")
                break;
            case WorkerInitState.UNINITIALIZED:
                this.log();
                console.error("Attempted to search uninitialized DB!")
        }

    }

    cancel() {
        if (this.state.init === WorkerInitState.SEARCHING) {
            const {ogs} = this.state;
            ogs.cancel();
            this.state = {...this.state, init: WorkerInitState.LOADED};
        }
    }

    log() {
        this.console.log(this);
    }
}

// TODO: move types to d.ts, import type
let sw: SearchWorkerHelper = new SearchWorkerHelper();

// Respond to message from parent thread
ctx.addEventListener("message", (e) => {
    const message: SearchWorkerCommandMessage = e.data;
    switch (message.command) {
        case "INIT":
            const {dbName, langDB, debug} = message.payload;
            sw.start(dbName, langDB, debug);
            break;
        case "LOAD_DB":
            sw.loadDB();
            break;
        case "SEARCH":
            const {query, searchID} = message.payload;
            sw.search(query, searchID);
            break;
        case "CANCEL":
            sw.cancel();
            break;
        case "LOG":
            sw.log();
            break;
    }
});

export default null as any;
