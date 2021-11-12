# Liburry

## About
Liburry is a framework for easily generating custom search engines. The applications generated by Liburry are Progressive Web Apps (PWAs), meaning that they are accessed just like a website and can be installed or accessed directly from the browser, even offline.

## Examples
The flagship site for Liburry is [taigi.us](https://taigi.us), a cross-language dictionary for Taiwanese Hokkien.

## Goals

### Simple
You go to the URL for a Liburry application. You type in words. Relevant search results appear.

### Fast
Liburry intends to be extremely responsive for all reasonable searches on relatively modern hardware. Searches happen immediately as you type, and results appear as soon as they are available. Liburry is tested regularly on 6-10 year old hardware, and aims to have sub-second resolution for most searches.

Instant responsiveness on hardware more than ~8 years old is not a primary goal of the project, but if you're interested in seeing that happen, please file an issue.

### Offline-First
Liburry apps work offline, immediately after loading them for the first time. You do not need to install an app on your device for it to work offline - when you go to the URL of the website in your browser while offline, it will still load and be able to search.

### Privacy-First
The only communication with a remote server in Liburry is the initial page/configuration load. Errors are *not* logged remotely, user behavior is *not* tracked remotely, and no behavioral information is retained anywhere the maintainers of this software could reach. If you have security or privacy questions or concerns, feel free to file an issue in the repo.

### Extensible
The code has been written to be modular throughout, so the following are quite easy to implement:
    * New search algorithms (Lunr, JSSearch, your custom Rust+WASM search library, etc)
    * New types of data (recipes, locations, definitions, internal company data, etc)
    * New display rules/modes:
        * Different visual layouts for text results
        * Location results on maps
        * Videos or images in results
    * New formats for data:
        * Remote database searches
        * New local file formats (JSON, binary blobs, SQLite)
    * Actions for results (click-to-copy, read-aloud, follow/expand links, etc)

### No Need To Write Code To Set Up A New Instance
If your search data is a data type that already works in Liburry, you don't need to write any code to add a new search engine - only configuration and data:
    * Configuration files (usually in YAML) describing the following:
        * Your app's basic settings
        * Your app's supported (human) languages, if any
        * Your datasets, and some basic information about your datasets
    * Your data (currently CSV, other formats can easily be supported)
    * Markdown pages (About, Contact, etc)

### Hostable Anywhere, By Anyone
Liburry is fully open-source and aims to be easy to set up in any cloud provider, VPS, or server which supports running Node.

Although the configuration for Liburry sites is stored in this repo by default (for simplicity and ease of codemods), it's already possible to store and fetch configuration on your own servers and point a Liburry instance at that (please create an issue if you're interested in this, it's currently not documented as the strong preference is to have configuration live in-repo so new users can learn/glean from existing sites).

### Support For *Any* Human Language/Dialect With A Writing System
Because the first versions of Liburry were written with the Pe̍h-ōe-jī, Kàu-io̍k-pōo, and 台灣話文 writing systems for Taiwanese all in mind, a simple but extensible language framework lies behind the display layer, allowing the interface (and Markdown pages, and search results) to be displayed in any language or dialect you've defined in your configuration/data files.

### Support For Multiple Different Datasets In The Same App
Thanks to mandatory semantic tagging of display fields in Liburry configuration, multiple different datasets with different data formats, field names, languages, and more can be searched in parallel, while still allowing all of the results to be seamlessly displayed together as if they came from a single source.

### Showing, Not Telling
With the above goal in mind, Liburry tries to use as little interface text as possible, and let the design of the interface speak for itself. If you have any feedback on the design of the interface, or would like to see more complex search controls and have ideas on how to implement them with this goal in mind, please file an issue.

### Free And Open Source, Always
All code needed to run your own Liburry app lives here, for free, forever, in this repository. You can fork and modify the code as you see fit, within the constraints of the [license](LICENSE).

If you host a Liburry app for others to use, the only cost is whatever your hosting provider charges you.

## (Current) Non-Goals

### Supporting Old Browsers / No-Script Environments
This project is heavily reliant on fairly modern client-side Javascript for both searching and displaying results. It's possible to use the underlying search engine with server-side search, and/or do server-side rendering of the application itself, but there's no planned work on that right now. As always, if you're interested in seeing this happen, please file an issue.

### Disk/Memory Efficiency
The architecture of Liburry (client-side search) is memory-heavy by design/necessity, and this is unlikely to change unless server-side search is implemented, as mentioned above.

### Performant On Huge Datasets
The client-side architecture obviously does not lend itself well to searching very large databases. It's possible to split up moderately-sized datasets into bite-sized chunks that can be searched in parallel, but beyond a certain size performance will be an issue for client-side searches.

## Gotchas/Caveats/Notes
* Because Liburry apps are PWAs which use Service Workers, ***code changes will not be visible to clients until they've closed all open tabs/windows for that app, even if they hard-refresh***. There are workarounds to this, but there's quite a bit of complexity. File an issue if this is an issue.
* Liburry apps for even moderately-sized datasets are *very* CPU-hungry while the user is typing, by design. Don't be surprised if your CPU fans spin up while searching.
* Liburry apps store their data in Service Worker cache in the browser. If users are low on disk space there's a chance the browser will decide to clear this cache. If that happens, or if the user wipes their own browser cache, the Liburry app will not work offline again until the user has loaded the app over the network.
* The first load of a Liburry app will *always* be slower than subsequent loads, since the Service Worker cache will need to be filled over the network.
* Because Liburry is a privacy-focused client-side experience, and user behaviors/errors are not logged anywhere off their own machine, *there is very little visibility for app maintainers into problems encountered by users*. Fatal load errors will give the user the option to file a detailed bug report with error codes and stack traces, but doing so is entirely at their discretion, and this is the extent of error handling/reporting in apps (beyond 404/5XX logging in your hosting provider). This means you'll want to be in frequent contact with your users about how they're using the app and any issues they're encountering.
* Liburry uses Service Worker precaching to speed up dataset fetching for the first app load after code updates. In the unlikely event things start breaking on the first load after a code change, please file an issue.

## Performance Tips
* When setting up a Liburry app, it's best to split your datasets across multiple files - each dataset is searched by a single Web Worker, so multiple datasets will be searched in parallel. (This one-dataset-per-worker constraint is only due to a design decision made for conceptual simplicity - if you'd like to see auto-splittable datasets or work-sharing pools, file an issue and bring some coffee).
* If possible, and you plan to have many users, use a CDN. Initial load times (and bandwidth costs, depending on your provider) will go down.
* If you've followed the above tips and your users are seeing slow performance on beefy hardware (and on good networks, for the first load), please file an issue. The default search algorithm is used mainly for its simplicity and intuitive experience, but there are many faster algorithms out there that can be added.

## Generating/Testing Your Own App
(NOTE: this section is currently in flux, as a recent change breaks AWS and other cloud providers which perform the builds in the cloud)

### Configuration
Add your app in the `src/config` folder (see `src/config/taigi.us` for an example).

Set the name of the environment variable `REACT_APP_CHHA_APPNAME` to be the name of your directory in `src/config`:
``` lang=sh
export REACT_APP_CHHA_APPNAME=<your_app_name>
```

### Testing locally
``` lang=sh
HTTPS=true yarn start
```

### Building the production app
``` lang=sh
yarn build
```

### Testing the production app locally
``` lang=sh
# Install serve if needed:
npm install -g serve

serve -s build
```

### (Example) Deploying to Google App Engine
``` lang=sh
# (set your environment variables here)
yarn build
gcloud app deploy --project <your_gapp_project_name>
```

### Commit your changes back upstream!
Obviously, this is optional - but it's in the spirit of open source!

Just check out a fork of the repo, add your app directory, and [follow this guide](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) to create a pull request.
