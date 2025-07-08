import crypto from "crypto";

// thanks to https://github.com/glomatico/votify/blob/main/votify/totp.py
export class TOTP {
	secret: Buffer;
	version: number;
	period: number;
	digits: number;

	constructor() {
		this.secret = Buffer.from(
			"10239356982684469120121471223494829410773366870",
			"utf8"
		);
		this.version = 11;
		this.period = 30;
		this.digits = 6;
	}

	generate(timestamp: number): string {
		const counter = Math.floor(timestamp / 1000 / this.period);
		const counterBytes = Buffer.alloc(8);
		counterBytes.writeBigUInt64BE(BigInt(counter));

		const hmac = crypto.createHmac("sha1", this.secret);
		hmac.update(counterBytes);
		const hmacResult = hmac.digest();

		const offset = hmacResult[hmacResult.length - 1] & 0x0f;
		const binary =
			((hmacResult[offset] & 0x7f) << 24) |
			((hmacResult[offset + 1] & 0xff) << 16) |
			((hmacResult[offset + 2] & 0xff) << 8) |
			(hmacResult[offset + 3] & 0xff);

		return (binary % Math.pow(10, this.digits))
			.toString()
			.padStart(this.digits, "0");
	}
}
