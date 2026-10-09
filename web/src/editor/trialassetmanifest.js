import {
	FIXED_TRIAL_ASSET_PATHS,
	TRIAL_ASSET_PROFILE,
} from "./trialassetpaths.js";
const shaPattern = /^[0-9a-f]{64}$/;
const fail = () => {
	throw new TypeError("invalid/unbound available-library snapshot");
};
function mime(path) {
	if (path.endsWith(".png")) {
		return "image/png";
	}
	if (path.endsWith(".json")) {
		return "application/json";
	}
	if (path.endsWith(".woff2")) {
		return "font/woff2";
	}
	if (path.endsWith(".flac")) {
		return "audio/flac";
	}
	if (path.endsWith(".wav")) {
		return "audio/wav";
	}
	if (path.endsWith(".txt")) {
		return "text/plain; charset=utf-8";
	}
	return "application/octet-stream";
}
function validRow(path, row) {
	return (
		row &&
		Object.keys(row).sort().join(",") === "blobPath,byteLength,mime,sha256" &&
		shaPattern.test(row.sha256) &&
		row.blobPath === `blobs/${row.sha256}` &&
		Number.isInteger(row.byteLength) &&
		row.byteLength > 0 &&
		row.byteLength <= 64 * 1024 * 1024 &&
		row.mime === mime(path)
	);
}
// Only verifies a byte snapshot; never supplies a runnable/closure/auth verdict.
export async function decodeTrialAssetManifest(bytes, trusted, sha256) {
	if (
		!(bytes instanceof Uint8Array) ||
		bytes.length > 256 * 1024 ||
		bytes.length === 0 ||
		typeof sha256 !== "function" ||
		!trusted ||
		!shaPattern.test(trusted.manifestSha256) ||
		bytes.length !== trusted.manifestByteLength ||
		(await sha256(bytes)) !== trusted.manifestSha256
	) {
		fail();
	}
	let result;
	try {
		result = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(bytes),
		);
	} catch (cause) {
		throw new TypeError("invalid snapshot JSON", { cause });
	}
	if (
		result?.schemaVersion !== 1 ||
		result.profile !== TRIAL_ASSET_PROFILE ||
		result.mode !== "STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE" ||
		result.baseRevision !== trusted.baseRevision ||
		result.runtimeDataSha256 !== trusted.runtimeDataSha256 ||
		!shaPattern.test(result.runtimeDataSha256) ||
		!result.resources ||
		Object.keys(result.resources).sort().join("\n") !==
			FIXED_TRIAL_ASSET_PATHS.join("\n")
	) {
		fail();
	}
	let total = 0;
	for (const path of FIXED_TRIAL_ASSET_PATHS) {
		const row = result.resources[path];
		if (!validRow(path, row)) {
			fail();
		}
		total += row.byteLength;
	}
	if (
		total > 128 * 1024 * 1024 ||
		!result.supportingFiles ||
		Object.keys(result.supportingFiles).join(",") !== "font/OFL-Oswald.txt" ||
		!validRow(
			"font/OFL-Oswald.txt",
			result.supportingFiles["font/OFL-Oswald.txt"],
		)
	) {
		fail();
	}
	if (
		!result.programHashes ||
		!trusted.programHashes ||
		Object.keys(result.programHashes).sort().join("\n") !==
			Object.keys(trusted.programHashes).sort().join("\n")
	) {
		fail();
	}
	for (const path of Object.keys(trusted.programHashes)) {
		if (
			result.programHashes[path] !== trusted.programHashes[path] ||
			!shaPattern.test(result.programHashes[path])
		) {
			fail();
		}
	}
	if (
		!Array.isArray(result.unresolvedReferences) ||
		result.unresolvedReferences.length !== 20
	) {
		fail();
	}
	const chapters = new Set();
	for (const ref of result.unresolvedReferences) {
		if (
			typeof ref.chapterId !== "string" ||
			!ref.chapterId ||
			chapters.has(ref.chapterId) ||
			ref.slot !== 127 ||
			ref.portrait !== 255 ||
			ref.logicalURL !== "kao/255.png"
		) {
			fail();
		}
		chapters.add(ref.chapterId);
	}
	return result;
}
export async function verifyTrialAssetBlob(
	manifest,
	logicalURL,
	bytes,
	sha256,
) {
	if (
		manifest?.mode !== "STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE" ||
		!FIXED_TRIAL_ASSET_PATHS.includes(logicalURL)
	) {
		fail();
	}
	const row = manifest.resources?.[logicalURL];
	if (
		!validRow(logicalURL, row) ||
		!(bytes instanceof Uint8Array) ||
		bytes.length !== row.byteLength ||
		typeof sha256 !== "function" ||
		(await sha256(bytes)) !== row.sha256
	) {
		fail();
	}
	return bytes; // hash-bound bytes, not a filesystem/network URL or rule input install
}
