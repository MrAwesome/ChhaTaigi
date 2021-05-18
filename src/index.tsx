import * as React from "react";
import ReactDOM from "react-dom";

import {DebugArea, SearchBar, EntryContainer} from "./components";
import debugConsole from "./debug_console";

import "./cha_taigi.css";
import "./menu.css";
import {ChaTaigiState, ChaTaigiStateArgs, PerDictResults, SearchResultEntry} from "./types";
import {DATABASES} from "./search_options";
import {typeGuard} from "./typeguard";

//import {ChaMenu} from "./cha_menu";

import {mod} from './utils';

import * as serviceWorkerRegistration from './serviceWorkerRegistration';
//import reportWebVitals from "./reportWebVitals";

// eslint-disable-next-line import/no-webpack-loader-syntax
import Worker from "worker-loader!./search.worker";

// TODO(urgent): use delimiters instead of dangerouslySetInnerHTML
// TODO(urgent): chase down error causing duplicate search entries
// TODO(urgent): debug and address firefox flash of blankness during font load
// TODO(high): show/search typing input
// TODO(high): make fonts bigger across the board
// TODO(high): asynchronous font loading: https://css-tricks.com/the-best-font-loading-strategies-and-how-to-execute-them/
// TODO(high): let hyphens and spaces be interchangeable in search
// TODO(high): focus search bar on load -> enter typing mode (autofocus is working, so some re-render seems to be taking away focus) (react-burger-menu seems to steal focus?)
// TODO(high): migrate to tsx cra with service worker (see ~/my-app)
// TODO(high): come up with a more elegant/extensible way of transforming a db entry into elements to be displayed
// TODO(high): change name to chaa5_taigi (chhâ)
// TODO(high): determine why duplicate search results are sometimes returned (see "a" results for giku)
// TODO(high): change from "fullscreen" to (check) "minimal-ui"
// TODO(high): add keys as opposed to indices
// TODO(high): fix icon sizes/manifest: https://github.com/facebook/create-react-app/blob/master/packages/cra-template/template/public/manifest.json (both ico and icon)
// TODO(high): add other databases from ChhoeTaigi
//               * write out schema
//               * update conversion scripts
//               * decide on display changes for multiple DBs
// TODO(high): handle alternate spellings / parentheticals vs separate fields
// TODO(high): handle explanation text (see "le" in Giku)
// TODO(high): add copyright/about page/info
// TODO(high): Fix clipboard notif not working on most browsers
// TODO(high): Fix typing before load not searching
// TODO(high): Copy to clipboard on click or tab-enter (allow for tab/hover enter/click focus equivalency?)
// TODO(high): have search updates appear asynchronously from typing
// TODO(high): use react-window or react-virtualized to only need to render X results at a time
// TODO(high): create an index of all 3 categories combined, and search that as text?
// TODO(high): remove parentheses from unicode entries, treat as separate results
// TODO(high): let spaces match hyphens and vice-versa
// TODO(high): investigate more performant search solutions (lunr, jssearch, etc)
// TODO(high): benchmark, evaluate search/render perf, especially with multiple databases
// TODO(high): remove parentheses from unicode, treat as separate results, chomp each result
// TODO(mid): replace "var" with "let"
// TODO(mid): download progress indicators
// TODO(mid): show per-db loading information
// TODO(mid): re-trigger currently-ongoing search once db loads (see top of searchDB)
// TODO(mid): keybinding for search (/)
// TODO(mid): Handle parentheses in pojUnicode in maryknoll: "kàu chia (án-ni) jî-í" (giku), "nā-tiāⁿ (niā-tiāⁿ, niā-niā)" (maryknoll) {{{ create github issue for chhoetaigidatabase }}}
// TODO(mid): "search only as fallback"
// TODO(mid): link to pleco/wiktionary for chinese characters, poj, etc
// TODO(mid): unit/integration tests
// TODO(mid): long press for copy on mobile
// TODO(mid): replace loading placeholder with *grid* of db loading updates
// TODO(mid): move search bar to middle of page when no results and no search yet
// TODO(mid): button for "get all results", default to 10-20
// TODO(mid): visual indication that there were more results
// TODO(low): font size button
// TODO(low): locally-stored settings, or users
// TODO(low): abstract away searching logic to avoid too much fuzzysort-specific code
// TODO(low): have GET param for search (and options?)
// TODO(low): configurable searches (exact search, slow but better search, etc)
// TODO(low): hashtag load entry (for linking)
// TODO(low): move to camelCase
// TODO(low): prettier search/load indicators
// TODO(low): notify when DBs fail to load
// TODO(low): store options between sessions
// TODO(low): radio buttons of which text to search
// TODO(low): hoabun text click should copy hoabun?
// TODO(low): title
// TODO(low): copyright, links, etc
// TODO(low): settings
// TODO(low): fix the default/preview text
// TODO(low): check web.dev/measure
// TODO(low): replace !some with every
// TODO(wishlist): dark mode support
// TODO(wishlist): "add to desktop" shortcut
// TODO(wishlist): non-javascript support?
// TODO(wishlist): dark and light themes
// TODO(later): homepage
// TODO(later): homepage WOTD
// TODO(later): download CSVs, do initial processing via js, store in service worker (if possible?)
// TODO(later): "show me random words"
// TODO(later): include soatbeng/explanations
// TODO(later): include alternates (very hard with maryknoll)
// TODO(later): remove parentheticals from maryknoll entries
// TODO(later): generalize for non-english definition
// TODO(later): word similarity analysis, link to similar/possibly-related words (this could be added to the CSVs)
// TODO(later): allow for entries to be marked incomplete/broken
// TODO(later): link to ChhoeTaigi for entries
//
// Project: Hoabun definitions
//      1) generalize "english" to definition
//      2) solidify transitional schema (soatbeng? or save that for later?) (hoabun vs hanlo_taibun_poj?)
//      3) modify build script to generate json files
//      4) create schemas under current model
//      5) modify containers if needed
//      6) test performance
//      7) create settings page with language toggle?


class ChaTaigi extends React.Component<any, any> {
    searchBar: React.RefObject<SearchBar>;
    query = "";

    // TODO: move these into their own helper class?
    searchWorkers: Map<string, Worker> = new Map();
    searchInvalidations: Array<boolean> = Array.from({length: 10}).map(_ => false);
    currentSearchIndex: number = 0;

    constructor(props: any) {
        super(props);
        this.state = {
            currentResults: new Map(),
            loadedDBs: new Map(),
        };

        DATABASES.forEach((_, dbName) => {this.state.loadedDBs.set(dbName, false)});

        this.searchBar = React.createRef();

        this.onChange = this.onChange.bind(this);
        this.searchQuery = this.searchQuery.bind(this);
        this.resetSearch = this.resetSearch.bind(this);
        this.setStateTyped = this.setStateTyped.bind(this);
        this.getStateTyped = this.getStateTyped.bind(this);
        this.registerAllDBsLoadedSuccessfully = this.registerAllDBsLoadedSuccessfully.bind(this);
        this.cancelOngoingSearch = this.cancelOngoingSearch.bind(this);
        this.menu = this.menu.bind(this);
    }

    setStateTyped(state: ChaTaigiStateArgs<PerDictResults> | ((prevState: ChaTaigiState<PerDictResults>) => any)) {
        this.setState(state)
    }

    getStateTyped(): ChaTaigiState<PerDictResults> {
        return this.state as ChaTaigiState<PerDictResults>;
    }

    componentDidMount() {
        console.timeLog("initToAllDB", "componentDidMount");
        for (let [dbName, langDB] of DATABASES) {
            const worker = new Worker();
            this.searchWorkers.set(
                dbName,
                worker,
            );

            // TODO: find a better place for this sort of logic to live?
            // (next to the search worker in another file, and pass a callback for this to use to append results?)
            worker.onmessage = (e) => {
                const rt = e.data.resultType;
                const payload = e.data.payload;
                switch (rt) {
                    case "SEARCH_SUCCESS": {
                        let {results, dbName, searchID} = payload;
                        debugConsole.time("searchRender-" + dbName);
                        if (!this.searchInvalidations[searchID]) {
                            this.setStateTyped((state) => {
                                return state.currentResults.set(dbName, results);
                            });
                        }
                        debugConsole.timeEnd("searchRender-" + dbName);
                    }
                        break;
                    case "DB_LOAD_SUCCESS": {
                        let {dbName} = payload;
                        debugConsole.time("dbLoadRender-" + dbName);
                        this.setStateTyped((state) => {
                            return state.loadedDBs.set(dbName, true);
                        });
                        debugConsole.timeEnd("dbLoadRender-" + dbName);
                        // TODO: Can this have a race with the above because of passing in a function?
                        if (!Array.from(this.state.loadedDBs.values()).some(x => !x)) {
                            this.registerAllDBsLoadedSuccessfully();
                        }
                    }
                        break;
                }
            };


            worker.postMessage({command: "INIT", payload: {dbName, langDB}});
            worker.postMessage({command: "LOAD_DB"});
        }
    }


    registerAllDBsLoadedSuccessfully() {
        debugConsole.log("All databases loaded!")
        debugConsole.timeEnd("initToAllDB");
        debugConsole.time("allDBRegister");
        if (this.searchBar.current) {
            this.searchBar.current.textInput.current.focus();
            this.searchQuery();
        }
        debugConsole.timeEnd("allDBRegister");
    }

    onChange(e: any) {
        const {target = {}} = e;
        const {value = ""} = target;
        const query = value;

        this.query = query;
        this.searchQuery();
    }

    menu() {
        // TODO: performance testing
        return null;
        //return <ChaMenu />;
    }

    resetSearch() {
        this.query = "";

        this.setStateTyped((state) => {
            state.currentResults.clear();
            return state;
        });
    }

    cancelOngoingSearch() {
        this.searchInvalidations[mod(this.currentSearchIndex - 1, this.searchInvalidations.length)] = true;
        this.searchWorkers.forEach(
            (worker, _) =>
                worker.postMessage({command: "CANCEL"})
        );
    }

    searchQuery() {
        const query = this.query;

        this.cancelOngoingSearch();

        if (query === "") {
            this.resetSearch();
        } else {
            this.searchWorkers.forEach((worker, _) =>
                worker.postMessage({command: "SEARCH", payload: {query, searchID: this.currentSearchIndex}}));

            this.currentSearchIndex = mod(this.currentSearchIndex + 1, this.searchInvalidations.length);
            this.searchInvalidations[this.currentSearchIndex] = false;
        }
    }

    render() {
        const {onChange} = this;
        const {currentResults, loadedDBs} = this.getStateTyped();
        // TODO: strengthen typing, find out why "undefined" can get passed from search results
        const allPerDictResults = [...currentResults.values()].filter(typeGuard);

        var shouldDisplayDebugArea = currentResults.size === 0;
        const dbg = shouldDisplayDebugArea ? <DebugArea loadedDBs={loadedDBs} /> : null;
        const entries = getEntries(allPerDictResults);

        return (
            <div className="ChaTaigi">
                <div className="non-menu">
                    <SearchBar ref={this.searchBar} onChange={onChange} />
                    <div className="search-area-buffer" />
                    {entries}
                    {dbg}
                </div>
                {this.menu()}
            </div>
        );
    }
}

// TODO: clean up, include dict names/links
function getEntries(perDictRes: PerDictResults[]): JSX.Element[] {
    let entries: SearchResultEntry[] = [];

    // Flatten out all results
    perDictRes.forEach((perDict: PerDictResults) => {
        perDict.results.forEach((entry: SearchResultEntry) => {
            entries.push(entry);
        });
    });

    entries.sort((a, b) => b.dbSearchRanking - a.dbSearchRanking);

    const entryContainers = entries.map((entry) => <EntryContainer entry={entry} key={entry.key} />);

    return entryContainers;
    //return <IntermediatePerDictResultsElements key={perDictRes.dbName} perDictRes={perDictRes} />;
}

debugConsole.time("initToAllDB");
const rootElement = document.getElementById("root");
ReactDOM.render(
    <React.StrictMode>
        <ChaTaigi />
    </React.StrictMode>, rootElement);

serviceWorkerRegistration.register();
//reportWebVitals(console.log);
