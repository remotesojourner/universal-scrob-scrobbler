<h1 align="center">
  <br>
  <img alt="Universal Scrob Scrobbler" src="https://github.com/remotesojourner/universal-scrob-scrobbler/raw/master/src/images/uts-icon-128.png" width="150">
  <br>
  Universal Scrob Scrobbler
  <br>
</h1>
<h4 align="center">A universal scrobbler for TV shows and movies on streaming services that sends data to Scrob.</h4>
<p align="center">
  <a href="https://github.com/remotesojourner/universal-scrob-scrobbler/releases">
    <img alt="GitHub Release" src="https://img.shields.io/github/release/remotesojourner/universal-scrob-scrobbler.svg">
  </a>
</p>
<p align="center">
  <a href="https://chrome.google.com/webstore/detail/universal-scrob-scrobbler/iopngfcbfklgnpjacladokjnlnenkeki"><img src="https://github.com/remotesojourner/universal-scrob-scrobbler/raw/master/assets/chrome-badge.png" alt="Get the extension on Chrome"></a>
  <a href="https://addons.mozilla.org/en-GB/firefox/addon/universal-scrob-scrobbler"><img src="https://github.com/remotesojourner/universal-scrob-scrobbler/raw/master/assets/firefox-badge.png" alt="Get the extension on Firefox"></a>
</p>

You can also install the extension manually by downloading the zip for your browser here: https://github.com/remotesojourner/universal-scrob-scrobbler/releases

### Loading the extension manually in Chrome

1. Unzip `chrome.zip`
2. Go to chrome://extensions
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the folder you unzipped

### Loading the extension manually in Firefox

1. Go to about:debugging#/runtime/this-firefox
2. Click "Load temporary addon"
3. Select `firefox.zip` or, if it's unzipped, select any file in the folder

Extension will be enabled until you restart Firefox.

### Loading the extension manually in Safari (macOS)

Safari support is experimental. Build with `pnpm build-dev` to generate `build/safari`,
or `pnpm build` to also generate `dist/safari.zip`. Safari 18.4 or later can load the
folder or zip directly:

1. Open Safari > Settings > Advanced and enable **Show features for web developers**.
2. In Settings > Developer, click **Add Temporary Extension…** and approve the prompt.
3. Select `build/safari` (or `dist/safari.zip`) and enable the extension.
4. Connect to Scrob and grant access to your server. Enable the streaming services
   you use in the extension settings and allow their website access in Safari.

Temporary extensions expire after 24 hours or when Safari quits. Desktop notifications
and Firefox's optional cookie-header workaround are not available in the Safari build.
Keep a signed-in Netflix tab open while loading Netflix history in Safari; Netflix
requests use that tab to access its first-party session cookies.
Scrob connection, playback detection, and history sync need validation in Safari;
successful packaging alone does not verify individual streaming services.

To generate a macOS app wrapper with full Xcode installed:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun safari-web-extension-converter build/safari \
  --project-location build/safari-xcode \
  --app-name 'Universal Scrob Scrobbler' \
  --bundle-identifier com.universal-scrob-scrobbler.Universal-Scrob-Scrobbler \
  --macos-only --swift --no-open --no-prompt
```

Open the generated Xcode project, configure signing, and run the app. The project
references `build/safari`, so rebuild the extension before rebuilding the app.
Unsigned local builds require **Allow unsigned extensions** in Safari's Developer
settings; Safari resets that setting when it quits. Distribution requires appropriate
Apple signing and packaging. See [Apple's installation guide](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

### Table of Contents

- [Loading the extension manually in Chrome](#loading-the-extension-manually-in-chrome)
- [Loading the extension manually in Firefox](#loading-the-extension-manually-in-firefox)
- [Loading the extension manually in Safari](#loading-the-extension-manually-in-safari-macos)
- [Table of Contents](#table-of-contents)
- [What is Universal Scrob Scrobbler?](#what-is-universal-scrob-scrobbler)
- [Why do I need this extension?](#why-do-i-need-this-extension)
- [Which streaming services are supported?](#which-streaming-services-are-supported)
- [How does the extension work?](#how-does-the-extension-work)
- [Known Issues](#known-issues)
- [Other Problems](#other-problems)
- [Development](#development)
  - [How to add more streaming services](#how-to-add-more-streaming-services)
  - [How to add scrobbler/sync to streaming services](#how-to-add-scrobblersync-to-streaming-services)
- [Credits](#credits)

### What is Universal Scrob Scrobbler?

An extension that allows you to automatically scrobble TV shows and movies that you are watching, and sync your history, from your favorite streaming services (such as Netflix, Amazon Prime Video, Disney+, etc.) to your Scrob server.

### Why do I need this extension?

It seamlessly tracks your playback across major streaming platforms in real-time, matching titles, seasons, and episode numbers, and syncing watch history directly to your Scrob account.

### Which streaming services are supported?

<!-- services-start -->
| Streaming Service | Scrobble | Sync | Limitations                      |
| :---------------: | :------: | :--: | :------------------------------- |
|   Amazon Prime    |    ✔️    |  ✔️  | Scrobbling only works in English |
|       AMC+        |    ✔️    |  ❌  | -                                |
|       Crave       |    ✔️    |  ✔️  | -                                |
|    Crunchyroll    |    ❌    |  ✔️  | -                                |
|    discovery+     |    ✔️    |  ✔️  | -                                |
|      Disney+      |    ✔️    |  ❌  | -                                |
|        Go3        |    ✔️    |  ❌  | -                                |
|     GoPlay BE     |    ✔️    |  ❌  | -                                |
|   Max / HBO Max   |    ✔️    |  ✔️  | -                                |
|      Hotstar      |    ✔️    |  ❌  | -                                |
|      Kijk.nl      |    ✔️    |  ❌  | -                                |
|       MUBI        |    ✔️    |  ✔️  | -                                |
|      Netflix      |    ✔️    |  ✔️  | -                                |
|        NRK        |    ✔️    |  ✔️  | -                                |
|     Player.pl     |    ✔️    |  ❌  | -                                |
|  Polsatboxgo.pl   |    ✔️    |  ❌  | -                                |
|    SkyShowtime    |    ✔️    |  ❌  | -                                |
|    Streamz BE     |    ✔️    |  ❌  | -                                |
|      Tet TV+      |    ✔️    |  ❌  | -                                |
|     TV 2 PLAY     |    ✔️    |  ✔️  | -                                |
|      Viaplay      |    ✔️    |  ✔️  | -                                |
|       Vidio       |    ✔️    |  ❌  | -                                |
|     VRT MAX BE    |    ✔️    |  ❌  | -                                |
|     VTMGo BE      |    ✔️    |  ❌  | -                                |

<!-- services-end -->

### How does the extension work?

It extracts information about the TV shows / movies that you are watching / have watched by scraping the page or using the streaming service API and sends the data to your Scrob server.

### Known Issues

- You might have to disable the "automatic mode" in the Temporary Containers extension while logging in, if you use it.
- Make sure you are logged into streaming services before trying to sync history content.

### Other Problems

If you find any other problems or have suggestions or questions, feel free to [open an issue](https://github.com/remotesojourner/universal-scrob-scrobbler/issues/new).

### Credits

This project is a fork of [Universal Trakt Scrobbler](https://github.com/trakt-tools/universal-trakt-scrobbler) by [trakt-tools](https://github.com/trakt-tools).

It is designed to scrobble and sync watch history to [Scrob](https://github.com/ellite/scrob), a lightweight self-hosted media scrobble server created by [ellite](https://github.com/ellite).

[LICENSE](LICENSE)
