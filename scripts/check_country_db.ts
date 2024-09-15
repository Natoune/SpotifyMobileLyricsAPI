import fs from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import { get } from "simple-get";
import tarstream from "tar-stream";

if (!fs.existsSync(join(__dirname, "..", "db", "GeoLite2-Country.mmdb"))) {
	if (process.env.MAXMIND_ACCOUNT_ID && process.env.MAXMIND_LICENSE_KEY) {
		console.error("MaxMind database not found! Downloading...");

		const file = fs.createWriteStream(
			join(__dirname, "..", "db", "GeoLite2-Country.mmdb.tar.gz"),
		);

		get(
			{
				url: "https://download.maxmind.com/geoip/databases/GeoLite2-Country/download?suffix=tar.gz",
				headers: {
					Authorization: `Basic ${Buffer.from(
						`${process.env.MAXMIND_ACCOUNT_ID}:${process.env.MAXMIND_LICENSE_KEY}`,
					).toString("base64")}`,
				},
			},
			(err, res) => {
				if (err || !res) {
					console.error("Failed to download MaxMind database!");
					process.exit(1);
				}

				res.pipe(file);

				file.on("finish", () => {
					file.close();

					const extract = tarstream.extract();
					const readStream = fs.createReadStream(
						join(__dirname, "..", "db", "GeoLite2-Country.mmdb.tar.gz"),
					);

					readStream.pipe(zlib.createGunzip()).pipe(extract);

					extract.on("entry", (header, stream, next) => {
						if (header.name.endsWith("GeoLite2-Country.mmdb")) {
							stream.pipe(
								fs.createWriteStream(
									join(__dirname, "..", "db", "GeoLite2-Country.mmdb"),
								),
							);
						}
						stream.on("end", next);
						stream.resume();
					});

					extract.on("finish", () => {
						fs.unlinkSync(
							join(__dirname, "..", "db", "GeoLite2-Country.mmdb.tar.gz"),
						);
						console.info("MaxMind database downloaded successfully!");
					});

					extract.on("error", (e) => {
						console.error("Failed to extract MaxMind database!", e);
						process.exit(1);
					});
				});
			},
		);
	} else {
		console.error("MaxMind database not found and no credentials provided.");
		process.exit(1);
	}
}
