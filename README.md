# Spotify Mobile Lyrics API

This API overrides the Spotify API endpoint used in the Spotify mobile app to fetch lyrics for the currently playing song.

You can use this API in xManager to fetch lyrics without having a Spotify Premium account.

- [Spotify Mobile Lyrics API](#spotify-mobile-lyrics-api)
  - [How it works](#how-it-works)
  - [xManager](#xmanager)
    - [Patch xManager](#patch-xmanager)
      - [Download the pre-patched releases](#download-the-pre-patched-releases)
      - [Manually patch xManager release](#manually-patch-xmanager-release)
  - [Public servers list](#public-servers-list)
  - [Server setup](#server-setup)
    - [Vercel](#vercel)
    - [Cloudflare Workers](#cloudflare-workers)
    - [Node.js / Bun](#nodejs--bun)
  - [Contributors](#contributors)
  - [License](#license)

## How it works

1. The Spotify mobile app sends a request to the **Mobile Spotify API** to get the lyrics for the currently playing song.

2. The official **Mobile Spotify API** endpoint is overridden in the app code to point to the **modified API**.

3. The **modified API** fetches the lyrics from the **WEB API** of Spotify, which doesn't require a Premium account.

4. The lyrics are returned in the correct format ([Protobuf](https://protobuf.dev/)) to the Spotify mobile app.

5. The mobile app displays the lyrics.

![How it works](.meta/how-it-works.png)

## xManager

### Patch xManager

> [!NOTE]  
> The latest versions of xManager already have the lyrics patch applied.  
> If you have an older version or want to use a different server, you can patch it manually.

#### Download the pre-patched releases

Go to the [releases](https://github.com/Natoune/SpotifyMobileLyricsAPI/releases) page and download the latest release of Spotify patched with xManager and the Spotify Mobile Lyrics API.

#### Manually patch xManager release

The script `patch:xmanager` will automatically download the latest release of xManager and apply the lyrics patch.

```bash
npm run patch:xmanager -- --server "lyrics.natanchiodi.fr" --name "Natan Chiodi" --apk "Spotify v8.9.84.594 [xManager] (Merged).apk"
```

Script arguments:

- `--server` the lyrics API host (see [Public servers list](#public-servers-list)).
- `--name` the name used to sign the patched APK.
- `--apk` the path to the Spotify APK. If not provided, the script will download the latest release (user input required).

## Public servers list

| Server name        | Host                                                                           | Owner                                      |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Default            | `lyrics.natanchiodi.fr`                                                        | [Natan Chiodi](https://github.com/Natoune) |
| Team xManager      | `xmanager-lyrics.dev`                                                          | [xC3FFF0E](https://github.com/xC3FFF0E)    |
| -                  | -                                                                              | -                                          |
| ➕ Add your server | See [Adding a public server](CONTRIBUTING.md#adding-a-public-server) |                                            |

## Server setup

### Vercel

> [!WARNING]
> The Free plan of Vercel is rate-limited (see [Limits](https://vercel.com/docs/limits/overview)).  
> It should be enough for personal use, but consider upgrading to a paid plan or using another provider if you need more requests.

You can deploy the API to Vercel with the following steps:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNatoune%2FSpotifyMobileLyricsAPI&env=SP_DC&envDescription=SP_DC%20cookie%20to%20authenticate%20against%20Spotify%20in%20order%20to%20have%20access%20to%20the%20required%20services.&envLink=https%3A%2F%2Fgithub.com%2Fakashrchandran%2Fsyrics%2Fwiki%2FFinding-sp_dc&project-name=spotify-mobile-lyrics-api&repository-name=SpotifyMobileLyricsAPI&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22redis%22%2C%22productSlug%22%3A%22redis%22%7D%5D)

1. Click the "Deploy with Vercel" button.
2. Set the `SP_DC` environment variable to the `sp_dc` cookie value from the Spotify Web Player (see [Finding sp_dc](https://github.com/akashrchandran/syrics/wiki/Finding-sp_dc)).
3. Set up the redis integration.
4. Deploy the API.

### Cloudflare Workers

You can deploy the API to Cloudflare Workers with the following steps:

1. Install the [Wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update) CLI.
2. Clone the repository:

```bash
git clone https://github.com/Natoune/SpotifyMobileLyricsAPI.git
cd SpotifyMobileLyricsAPI
```

3. Install the dependencies:

```bash
npm install
```

4. Copy the `wrangler.example.toml` file to `wrangler.toml`:

```bash
cp wrangler.example.toml wrangler.toml
```

5. Create a new KV namespace and add it to the `wrangler.toml` file:

```bash
npx wrangler kv namespace create sp_redis
```

wrangler.toml:

```toml
...

[[kv_namespaces]]
binding = "sp_redis"
id = "YOUR_KV_ID"
```

6. Add an `SP_DC` secret

Get the `sp_dc` cookie value from the Spotify Web Player (see [Finding sp_dc](https://github.com/akashrchandran/syrics/wiki/Finding-sp_dc)) and set it as a secret:

```bash
npx wrangler secret put SP_DC
```

7. Deploy the API:

```bash
npx wrangler deploy
```

### Node.js / Bun

You can run the API on your own server with Node.js or Bun.

1. Clone the repository:

```bash
git clone https://github.com/Natoune/SpotifyMobileLyricsAPI.git
cd SpotifyMobileLyricsAPI
```

2. Install the dependencies:

```bash
npm install
```

or

```bash
bun install
```

3. Set the environment variables:

.env:

```env
# The API must be available over HTTPS on port 443.
# Change this value only if you are behind a reverse proxy.
PORT=443

# Find a detailed guide on how to get your Spotify SP_DC cookie here: https://github.com/akashrchandran/syrics/wiki/Finding-sp_dc
SP_DC=your-spotify-cookie
```

4. Set up SSL **[REQUIRED]**

You have multiple options to set up SSL:

- Use a reverse proxy like [Nginx](https://www.nginx.com/) or [Caddy](https://caddyserver.com/).
- Use a service like [Cloudflare](https://www.cloudflare.com/ssl/).
- Use a certificate
  - Place the certificate and key at `certs/private.key` and `certs/cert.pem`.

5. Build and start the API:

```bash
npm run build
npm start
```

or

```bash
bun build
bun start
```

## Contributors

- [Natan Chiodi](https://github.com/Natoune) - Creator

If you want to contribute, please see the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
