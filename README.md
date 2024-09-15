# Spotify Mobile Lyrics API

This API overrides the Spotify API endpoint used in the Spotify mobile app to fetch lyrics for the currently playing song.

You can use this API in xManager to fetch lyrics without having a Spotify Premium account.

- [Spotify Mobile Lyrics API](#spotify-mobile-lyrics-api)
  - [How it works](#how-it-works)
  - [xManager](#xmanager)
    - [Patch xManager](#patch-xmanager)
      - [Download the pre-patched releases](#download-the-pre-patched-releases)
      - [Manually patch xManager release (Linux only)](#manually-patch-xmanager-release-linux-only)
  - [Public servers list](#public-servers-list)
  - [Server setup](#server-setup)
    - [The easy way](#the-easy-way)
    - [Manual setup](#manual-setup)
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

#### Download the pre-patched releases

Go to the [releases](https://github.com/Natoune/SpotifyMobileLyricsAPI/releases) page and download the latest release of Spotify patched with xManager and the Spotify Mobile Lyrics API.

#### Manually patch xManager release (Linux only)

The script `patch_xmanager.sh` will automatically download the latest release of xManager-patched Spotify and apply the Spotify Mobile Lyrics API patch.

```bash
wget https://raw.githubusercontent.com/Natoune/SpotifyMobileLyricsAPI/main/patch_xmanager.sh
chmod +x patch_xmanager.sh
./patch_xmanager.sh -server "lyrics.natanchiodi.fr" -name "Natan Chiodi" -apk "Spotify v8.8.74.652 [xManager] (Merged).apk"
```

Script arguments:

- `-server` the lyrics API host (see [Public servers list](#public-servers-list)).
- `-name` the name used to sign the patched APK.
- `-apk` the path to the xManager-patched Spotify APK. If not provided, the script will download the latest release (user input required).

## Public servers list

> [!TIP]
> You can deploy a server quickly with Vercel.\
> Don't forget to share your server with the community!\
> [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNatoune%2FSpotifyMobileLyricsAPI&env=SP_DC&envDescription=SP_DC%20cookie%20to%20authenticate%20against%20Spotify%20in%20order%20to%20have%20access%20to%20the%20required%20services.&envLink=https%3A%2F%2Fgithub.com%2Fakashrchandran%2Fsyrics%2Fwiki%2FFinding-sp_dc&project-name=spotify-mobile-lyrics-api&repository-name=SpotifyMobileLyricsAPI)

| Server name        | Host                                                                           | Owner                                      |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Default            | `lyrics.natanchiodi.fr`                                                        | [Natan Chiodi](https://github.com/Natoune) |
| -                  | -                                                                              | -                                          |
| ➕ Add your server | See [Adding a public server](CONTRIBUTING.md#adding-a-public-server) |                                            |

## Server setup

### The easy way

Deploy your server quickly with Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNatoune%2FSpotifyMobileLyricsAPI&env=SP_DC&envDescription=SP_DC%20cookie%20to%20authenticate%20against%20Spotify%20in%20order%20to%20have%20access%20to%20the%20required%20services.&envLink=https%3A%2F%2Fgithub.com%2Fakashrchandran%2Fsyrics%2Fwiki%2FFinding-sp_dc&project-name=spotify-mobile-lyrics-api&repository-name=SpotifyMobileLyricsAPI)

### Manual setup

#### 1. Clone the repository

```bash
git clone https://github.com/Natoune/SpotifyMobileLyricsAPI.git
cd SpotifyMobileLyricsAPI
```

#### 2. Install dependencies

`npm install` or `yarn install` or `pnpm install`

#### 3. Create a `.env` file

1/ Copy the `.env.example` file

```bash
cp .env.example .env
```

2/ Edit the `.env` file

```env
# The API must be available over HTTPS on port 443.
# Change this value only if you are behind a reverse proxy.
PORT=443

# Find a detailed guide on how to get your Spotify SP_DC cookie here: https://github.com/akashrchandran/syrics/wiki/Finding-sp_dc
SP_DC=your-spotify-cookie
```

#### 4. Set up SSL

1/ Get your SSL certificate

- [Get a free SSL certificate with Let's Encrypt](https://letsencrypt.org/getting-started/)
- [Get a free SSL certificate with ZeroSSL](https://zerossl.com/free-ssl/#crt)

2/ Add your SSL certificate to the `ssl` directory.

- `ca.pem` (optional): The certificate authority (CA) certificate.
- `cert.pem`: The server certificate.
- `key.pem`: The server private key.

#### 5. Set up MaxMind GeoIP2

1/ Download the GeoLite2 Country database from [MaxMind](https://dev.maxmind.com/geoip/geoip2/geolite2/).

2/ Extract the `GeoLite2-Country.mmdb` file to the `db` directory.

#### 6. Start the server

`npm run serve` or `yarn serve` or `pnpm serve`

#### 7. (Optional) Use a process manager to keep the server running

```bash
npm install -g pm2
pm2 start npm --name "spotify-mobile-lyrics-api" -- start
```

## Contributors

- [Natan Chiodi](https://github.com/Natoune) - Creator

If you want to contribute, please see the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
