const fs = require("node:fs");
const { execSync } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");

// HELPERS
const windows = process.platform === "win32";
const exists = (command) => {
	if (windows) {
		try {
			const stdout = execSync(`where ${command}`, { stdio: [] });
			return !!stdout;
		} catch {
			return false;
		}
	} else {
		try {
			const stdout = execSync(`command -v ${command}`, { stdio: [] });
			return !!stdout;
		} catch {
			return false;
		}
	}
};
const download = async (url, output) => {
	const res = await fetch(url);
	const file = fs.createWriteStream(output);
	await new Promise((resolve, reject) => {
		Readable.fromWeb(res.body).pipe(file);
		file.on("close", resolve);
		file.on("error", reject);
	});
};
const find = (dir, file) => {
	const files = fs.readdirSync(dir);
	for (const f of files) {
		const filePath = path.join(dir, f);
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			const res = find(filePath, file);
			if (res) return res;
		} else if (f === file) {
			return filePath;
		}
	}
	return null;
};

// Fetch command-line arguments
const args = process.argv.slice(2);
let server;
let name;
let apk;

for (let i = 0; i < args.length; i++) {
	switch (args[i]) {
		case "--server":
			server = args[++i];
			break;
		case "--name":
			name = args[++i];
			break;
		case "--apk":
			apk = args[++i];
			break;
	}
}

server = server || "lyrics.natanchiodi.fr";
name = name || "Natan Chiodi";

if (apk && !fs.existsSync(apk)) {
	console.error("The provided APK file does not exist.");
	process.exit(1);
}

(async () => {
	// Check dependencies
	const dependencies = ["java", "keytool", "jar"];
	for (const dep of dependencies) {
		if (!exists(dep)) {
			console.error(`"${dep}" not found.`);
			console.error("Please install Java Development Kit (JDK)");
			process.exit(1);
		}
	}

	// Create temporary directory
	const tmpDir = path.join(process.cwd(), "tmp-xmanager-patch");
	fs.rmSync(tmpDir, { recursive: true, force: true });
	fs.mkdirSync(tmpDir);
	process.chdir(tmpDir);

	// Download required tools
	console.log("Downloading required tools...");
	await download(
		"https://github.com/REAndroid/APKEditor/releases/download/V1.4.0/APKEditor-1.4.0.jar",
		"APKEditor.jar",
	);
	await download(
		"https://dl.google.com/android/repository/build-tools_r34-linux.zip",
		"build-tools.zip",
	);

	execSync("jar xvf build-tools.zip");
	fs.renameSync("android-14", "build-tools");
	fs.unlinkSync("build-tools.zip");
	fs.chmodSync(`build-tools/zipalign${windows ? ".exe" : ""}`, "755");
	fs.chmodSync(`build-tools/apksigner${windows ? ".bat" : ""}`, "755");

	// Get xManager Releases
	if (!apk) {
		console.log("No APK provided. Fetching latest xManager release...");
		await download(
			"https://github.com/Team-xManager/xManager/releases/latest/download/xManager.apk",
			"xManager.apk",
		);
		execSync("java -jar APKEditor.jar d -i xManager.apk -o xManager", {
			stdio: "ignore",
		});

		const stringsXml = fs.readFileSync(
			"xManager/resources/package_1/res/values/strings.xml",
			"utf-8",
		);
		const urlMatch = stringsXml.match(
			/https:\/\/gist\.githubusercontent\.com\/[^<]*/,
		);
		const url = urlMatch ? urlMatch[0] : null;
		if (!url) {
			console.error("Failed to fetch xManager releases.");
			process.exit(1);
		}

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		let alt;
		while (!alt) {
			const choice = await new Promise((resolve) => {
				console.log("Which version of Spotify do you want to patch?");
				console.log("1) Stock");
				console.log("2) Amoled");
				console.log("3) Lite");
				rl.question("Enter your choice: ", resolve);
			});

			switch (choice) {
				case "1":
					alt = "Stock_Patched";
					break;
				case "2":
					alt = "Amoled_Patched";
					break;
				case "3":
					alt = "Lite_Patched";
					break;
				default:
					console.error("Invalid choice.");
					console.log();
					break;
			}
		}

		await download(url, "versions.json");
		const versions = JSON.parse(fs.readFileSync("versions.json", "utf-8"));
		const mirror = versions[alt][versions[alt].length - 1].Mirror;

		if (!mirror.includes("fileport")) {
			console.error(
				"An error occurred while downloading the APK. Please download it manually.",
			);
			console.log(`Download link: ${mirror}`);
			process.exit(1);
		}

		await download(mirror, `${alt}.html`);
		const html = fs.readFileSync(`${alt}.html`, "utf-8");
		const downloadPath = html.match(/data-url="([^"]*)"/)[1];
		await download(`https://fileport.io${downloadPath}`, "input.apk");

		fs.unlinkSync(`${alt}.html`);
		fs.unlinkSync("xManager.apk");
		fs.unlinkSync("versions.json");
	} else {
		fs.copyFileSync(apk, path.join(tmpDir, "input.apk"));
	}

	// Patch Spotify
	console.log("Patching Spotify...");
	execSync("java -jar APKEditor.jar d -i input.apk -o disassembled", {
		stdio: "ignore",
	});

	const manifest = fs.readFileSync("disassembled/AndroidManifest.xml", "utf-8");
	const packageName = manifest.match(/package="([^"]*)"/)[1];

	if (packageName === "com.spotify.lite") {
		const smaliFile = find("disassembled", "mk3.smali");
		const smali = fs.readFileSync(smaliFile, "utf-8");
		const replaced = smali.replace(
			/v2, "https:\/\/(spclient\.wg\.spotify\.com|lyrics\.natanchiodi\.fr)\/"/g,
			`v2, "https://${server}/"`,
		);
		fs.writeFileSync(smaliFile, replaced);
	} else {
		const smaliFile = find("disassembled", "RetrofitUtil.smali");
		const smali = fs.readFileSync(smaliFile, "utf-8");
		const replaced = smali.replace(
			/v1, "(spclient\.wg\.spotify\.com|lyrics\.natanchiodi\.fr)"/g,
			`v1, "${server}"`,
		);
		fs.writeFileSync(smaliFile, replaced);
	}

	// Build patched APK
	console.log("Building patched APK...");
	execSync("java -jar APKEditor.jar b -i disassembled -o assembled.apk", {
		stdio: "ignore",
	});
	execSync(
		`./build-tools/zipalign${windows ? ".exe" : ""} -p -f 4 assembled.apk aligned.apk`,
	);

	if (!fs.existsSync("aligned.apk")) {
		console.error("An error occurred while building the patched APK.");
		process.exit(1);
	}

	// Sign APK
	console.log("Signing APK...");
	const password = crypto.randomBytes(32).toString("base64");
	execSync(
		`keytool -genkey -v -keystore keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias "${name}" -storepass ${password} -keypass ${password} -dname "CN=${name}"`,
		{ stdio: "ignore" },
	);
	execSync(
		`./build-tools/apksigner${windows ? ".bat" : ""} sign --ks keystore.jks --ks-pass pass:${password} --ks-key-alias "${name}" --key-pass pass:${password} --out ../Patched.apk aligned.apk`,
		{ stdio: "ignore" },
	);

	// Cleanup
	process.chdir("..");
	fs.rmSync(tmpDir, { recursive: true, force: true });

	console.log(`Patched APK saved as "Patched.apk".`);

	process.exit(0);
})();
