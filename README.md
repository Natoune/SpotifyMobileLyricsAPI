# Spotify Mobile Lyrics API

This API overrides the Spotify API endpoint used in the Spotify mobile app to fetch lyrics for the currently playing song.

You can use this API in xManager to fetch lyrics without having a Spotify Premium account.

- [Spotify Mobile Lyrics API](#spotify-mobile-lyrics-api)
  - [How it works](#how-it-works)
  - [ReVanced](#revanced)
  - [xManager](#xmanager)
    - [Patch xManager](#patch-xmanager-not-maintained)
      - [Download the pre-patched releases](#download-the-pre-patched-releases)
      - [Manually patch xManager release](#manually-patch-xmanager-release)
  - [Public servers list](#public-servers-list)
  - [Server setup](#server-setup)
    - [Docker](#docker)
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

## ReVanced

You can use this API with [ReVanced](https://revanced.app/) to fetch lyrics without having a Spotify Premium account.

Use the patch "[Change lyrics provider](https://revanced.app/patches?s=Change+lyrics+provider)" in the ReVanced Manager and set the host to `lyrics.natanchiodi.fr` or to your own server.

## xManager

### Patch xManager (Not maintained)

> [!NOTE]  
> I stopped working on the xManager patch script for lyrics since ReVanced included the "Change lyrics provider" patch.  
> The script I make available in this repo will not work on newer versions of Spotify.

#### Download the pre-patched releases

Go to the [releases](https://github.com/Natoune/SpotifyMobileLyricsAPI/releases) page and download the latest release of Spotify patched with xManager and the Spotify Mobile Lyrics API.

#### Manually patch xManager release

The script `patch:xmanager` will automatically download the latest release of xManager and apply the lyrics patch.

```bash
npm run patch:xmanager -- --server "lyrics.natanchiodi.fr" --apk "Spotify v8.9.84.594 [xManager] (Merged).apk" --ks-file "keystore.jks" --ks-pass "******"
```

Script arguments:

- `--server` the lyrics API host (see [Public servers list](#public-servers-list)).
- `--apk` the path to the Spotify APK. If not provided, the script will download the latest release (user input required).
- `--ks-file` (optional) the path to the keystore file.
- `--ks-pass` (optional) the keystore password.

If no keystore is provided, the script will sign the APK with your username.

## Public servers list

| Server name        | Host                                                                           | Owner                                      |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Default            | `lyrics.natanchiodi.fr`                                                        | [Natan Chiodi](https://github.com/Natoune) |
| Team xManager      | `xmanager-lyrics.dev`                                                          | [xC3FFF0E](https://github.com/xC3FFF0E)    |
| -                  | -                                                                              | -                                          |
| ➕ Add your server | See [Adding a public server](CONTRIBUTING.md#adding-a-public-server) |                                            |

## Server setup

### Docker

You can run the API in a Docker container.

The container will expose the API on port 3000. You can change the port by changing the `-p` argument.

Environment variables:

- `SP_DC` the `sp_dc` cookie value from the Spotify Web Player (see [Finding sp_dc](https://github.com/akashrchandran/syrics/wiki/Finding-sp_dc)).
- `DATABASE_TYPE` (optional) the type of database to use. Supported values: `sqlite`, `mysql`, `postgres`.
- `DATABASE_URL` (optional) the database connection URI. Required if `DATABASE_TYPE` is set to `mysql` or `postgres`.
- `SSL_CERT` (optional) the SSL certificate string.
- `SSL_KEY` (optional) the SSL key string.

You can also mount a volume to `/usr/src/app/certs` to provide the SSL certificate and key (`cert.pem` and `private.key`).

#### Example

1. Pull the image:

```bash
docker pull ghcr.io/natoune/spotify-mobile-lyrics-api:latest
```

2. Run the container:

```bash
docker run -d -p 443:3000 -e SP_DC=spotify-cookie  -v /path/to/certs:/usr/src/app/certs ghcr.io/natoune/spotify-mobile-lyrics-api:latest
```

### Vercel

> [!WARNING]
> The Free plan of Vercel is rate-limited (see [Limits](https://vercel.com/docs/limits/overview)).  
> It should be enough for personal use, but consider upgrading to a paid plan or using another provider if you need more requests.

You can deploy the API to Vercel with the following steps:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNatoune%2FSpotifyMobileLyricsAPI&env=SP_DC&envDescription=SP_DC%20cookie%20to%20authenticate%20against%20Spotify%20in%20order%20to%20have%20access%20to%20the%20required%20services.&envLink=https%3A%2F%2Fgithub.com%2Fakashrchandran%2Fsyrics%2Fwiki%2FFinding-sp_dc&project-name=spotify-mobile-lyrics-api&repository-name=SpotifyMobileLyricsAPI&stores=[{"type"%3A"integration"%2C"integrationSlug"%3A"neon"%2C"productSlug"%3A"neon"}])

1. Click the "Deploy with Vercel" button.
2. Set the `SP_DC` environment variable to the `sp_dc` cookie value from the Spotify Web Player (see [Finding sp_dc](https://github.com/akashrchandran/syrics/wiki/Finding-sp_dc)).
3. Set up the database integration.
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

5. (Optional) Set up the database integration:

```bash
npx wrangler secret put DATABASE_TYPE
npx wrangler secret put DATABASE_URL
```

(Set the value of `DATABASE_TYPE` to `postgres` or `mysql`)

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

# Enable this for debugging purposes.
LOG_REQUESTS=false

# The database is optional.
# Use SQLite if you can use the filesystem, or MySQL/Postgres if you have a remote database.
DATABASE_TYPE=sqlite

# DATABASE_TYPE=mysql or postgres
# DATABASE_URL=your-database-uri
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
