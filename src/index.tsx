import * as React from "react";
import ReactDOM from "react-dom";

import {SearchBar, PlaceholderArea, ResultsArea} from "./components";
import debugConsole from "./debug_console";
import {fetchDB} from "./dictionary_handling";

import "./cha_taigi.css";
import "./menu.css";
import {SearchableDict, ChaTaigiState, ChaTaigiStateArgs, PerDictResultsElements} from "./types";
import {OngoingSearch, searchDB} from "./search";
import {DATABASES} from "./search_options";

import {ChaMenu} from "./cha_menu";
//import reportWebVitals from "./reportWebVitals";


// TODO(urgent): use delimiters instead of dangerouslySetInnerHTML
// TODO(high): migrate to tsx cra with service worker (see ~/my-app)
// TODO(high): change name to chaa5_taigi (chhâ)
// TODO(high): determine why duplicate search results are sometimes returned (see "a" results for giku)
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
// TODO(mid): keybinding for search (/)
// TODO(mid): Handle parentheses in pojUnicode in maryknoll: "kàu chia (án-ni) jî-í" (giku), "nā-tiāⁿ (niā-tiāⁿ, niā-niā)" (maryknoll)
// TODO(mid): "search only as fallback"
// TODO(mid): link to pleco/wiktionary for chinese characters, poj, etc
// TODO(mid): unit/integration tests
// TODO(mid): long press for copy on mobile
// TODO(mid): replace loading placeholder with *grid* of db loading updates
// TODO(mid): move search bar to middle of page when no results and no search yet
// TODO(mid): button for "get all results", default to 10-20
// TODO(mid): visual indication that there were more results
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
// TODO(low): fix the default/preview text
// TODO(wishlist): dark mode support
// TODO(wishlist): "add to desktop" shortcut
// TODO(wishlist): non-javascript support?
// TODO(later): generalize for non-english definition


class IntermediatePerDictResultsElements extends React.Component<any, any> {
    render() {
        const {perDictRes} = this.props;
        const {dbName, results} = perDictRes;
        return <div className="TODO-intermediate-results">
            <div className="TODO-db-header">{dbName}</div>
            {results}
        </div>
    }

}


class ChaTaigi extends React.Component<any, any> {
    constructor(props: any) {
        super(props);
        this.state = {
            currentResultsElements: [],
            searchableDicts: [],
            ongoingSearches: [],
        };

        this.onChange = this.onChange.bind(this);
        this.doSearch = this.doSearch.bind(this);
        this.resetSearch = this.resetSearch.bind(this);
        this.setStateTyped = this.setStateTyped.bind(this);
        this.getStateTyped = this.getStateTyped.bind(this);
        this.appendSearch = this.appendSearch.bind(this);
        this.appendDict = this.appendDict.bind(this);
        this.appendResults = this.appendResults.bind(this);
        this.menu = this.menu.bind(this);
    }

    setStateTyped(state: ChaTaigiStateArgs<IntermediatePerDictResultsElements> | ((prevState: ChaTaigiState<IntermediatePerDictResultsElements>) => any)) {
        this.setState(state)
    }

    getStateTyped(): ChaTaigiState<IntermediatePerDictResultsElements> {
        return this.state as ChaTaigiState<IntermediatePerDictResultsElements>;
    }

    componentDidMount() {
        for (let [dbName, langDB] of DATABASES) {
            fetchDB(dbName, langDB, this.appendDict);
        }
    }

    appendDict(newDict: SearchableDict) {
        this.setStateTyped((state: ChaTaigiState<IntermediatePerDictResultsElements>) => ({searchableDicts: [...state.searchableDicts, newDict]}));
    }

    appendSearch(newSearch: OngoingSearch) {
        this.setStateTyped((state: ChaTaigiState<IntermediatePerDictResultsElements>) => ({ongoingSearches: [...state.ongoingSearches, newSearch]}));
    }

    appendResults(results: PerDictResultsElements) {
        debugConsole.time("appendResults-setState");
        const TODOIntermediate = <IntermediatePerDictResultsElements key={results.dbName} perDictRes={results} />
        this.setStateTyped((state: ChaTaigiState<IntermediatePerDictResultsElements>) => ({currentResultsElements: [...state.currentResultsElements, TODOIntermediate]}));
        debugConsole.timeEnd("appendResults-setState");
    }


    onChange(e: any) {
        const {searchableDicts, ongoingSearches} = this.getStateTyped();
        const {target = {}} = e;
        const {value = ""} = target;
        const query = value;

        ongoingSearches.forEach((search) => search.cancel());

        if (query === "") {
            this.resetSearch();
        } else {
            // TODO: Correct place for this?
            this.setStateTyped({query, currentResultsElements: []});
            this.doSearch(query, searchableDicts);
        }
    }

    menu() {
        return <ChaMenu />;
    }

    resetSearch() {
        this.setStateTyped({
            query: "",
            ongoingSearches: [],
            currentResultsElements: []
        });
    }

    doSearch(query: string, searchableDicts: Array<SearchableDict>) {
        searchableDicts.forEach((searchableDict) => {
            searchDB(searchableDict, query, this.appendSearch, this.appendResults);
        });
    }

    render() {
        const {onChange} = this;
        const {currentResultsElements, searchableDicts, ongoingSearches, query} = this.getStateTyped();

        const searching = ongoingSearches.some((s) => !s.isCompleted());

        return (
            <div className="ChaTaigi">
                {this.menu()}
                <div className="non-menu">
                    <SearchBar onChange={onChange} />
                    <PlaceholderArea query={query} numResults={currentResultsElements.length} loaded={!!searchableDicts} searching={searching} />
                    <ResultsArea results={currentResultsElements} />
                </div>
            </div>
        );
    }
}

const rootElement = document.getElementById("root");
ReactDOM.render(
    <React.StrictMode>
        <ChaTaigi />
    </React.StrictMode>, rootElement);

//reportWebVitals(console.log);
