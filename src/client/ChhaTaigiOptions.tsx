import {PageID} from "./configHandler/zodConfigTypes";
import {SearcherType} from "./search";
import {MainDisplayAreaMode} from "./types/displayTypes";

export default class OptionsChangeableByUser {
    mainMode: MainDisplayAreaMode = MainDisplayAreaMode.SEARCH;
    searcherType: SearcherType = SearcherType.FUZZYSORT;
    debug: boolean = false;
    savedQuery: string = "";
    playground: boolean = false;
    pageID: PageID | null = null;
}