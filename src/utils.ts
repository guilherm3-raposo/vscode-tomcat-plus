import axios from "axios";
import { exec } from "child_process";
import find from "find-process";
import fs, { createWriteStream, existsSync, PathLike, rmSync } from "fs";
import os from "os";
import path, { sep } from "path";
import vscode, { workspace } from "vscode";
import { platform, serversFolder, zipsFolder } from "./extension";
import { TomcatEntry } from "./TomcatEntry";
import { MinorVersions } from "./types";

const extract = require("extract-zip");
const xml2js = require("xml2js");

const tomcat = "https://archive.apache.org/dist/tomcat/tomcat-";

export async function fetchMinorVersion(majorVersion: string, tomcatMinorVersions: MinorVersions) {
	if (tomcatMinorVersions[majorVersion].length) {
		return;
	}

	const response = await axios.get(`${tomcat}${majorVersion}/`);
	const regex = /(?<=<a href=")v[^\/]+(?=\/)/g;
	let arr: RegExpExecArray | null = null;
	while ((arr = regex.exec(response.data)) !== null) {
		tomcatMinorVersions[majorVersion].push(arr[0]);
	}
	let length = tomcatMinorVersions[majorVersion].length;
	tomcatMinorVersions[majorVersion].unshift(`Latest: ${tomcatMinorVersions[majorVersion][length - 1]}`);
	Promise.resolve();
}

export async function fetchMinorVersions(tomcatMinorVersions: MinorVersions) {
	for (const v in tomcatMinorVersions) {
		fetchMinorVersion(v, tomcatMinorVersions);
	}

	Promise.resolve();
}

export async function downloadSelectedVersion(majorVersion: string, minorVersion: string) {
	const fileName: PathLike = `apache-tomcat-${minorVersion.replace("v", "")}.zip`;
	const filePath: PathLike = path.join(zipsFolder.toString(), fileName);
	const serverPath: PathLike = path.join(serversFolder.toString(), fileName.replace(".zip", ""));
	const url = `${tomcat}${majorVersion}/${minorVersion}/bin/${fileName}`;

	if (existsSync(serverPath)) {
		/**
		 * @TODO Open possibility of overwriting server files
		 */
		vscode.window.showErrorMessage(`Tomcat version ${minorVersion} already exists, nothing to do.`);
		return;
	}

	if (!existsSync(filePath)) {
		const [downloaded, downloadErr] = await asyncCall(downloadFile(url, filePath));
		if (downloadErr) {
			Promise.reject(true);
		}
	}

	await extract(filePath, { dir: serversFolder });

	setPermissions(serverPath);

	setenv(serverPath);

	console.log("success");
}

export function removeSelectedVersion(version: string) {
	const p = path.join(serversFolder.toString(), version);
	fs.rmSync(p, { recursive: true });
}

export async function run(command: string) {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout, stderr) => {
			if (typeof error === "undefined") {
				resolve(stdout);
			} else {
				reject(stderr);
			}
		});
	});
}

export async function asyncCall(promise: Promise<any>) {
	try {
		const data = await promise;
		return [data, null];
	} catch (error) {
		return [null, error];
	}
}

export async function downloadFile(url: string, filePath: PathLike) {
	return new Promise(async (res, rej) => {
		try {
			const response = await axios.get(url, { responseType: "stream" });

			const stream = createWriteStream(filePath);
			stream.on("close", res);
			stream.on("error", (err) => {
				rmSync(filePath);
				rej(err);
			});
			response.data.pipe(stream);
		} catch (error) {
			rej("Failed to download Tomcat version");
			rmSync(filePath);
		}
	});
}

export async function startServer(entry: TomcatEntry, serverPath: PathLike) {
	if (platform === "win32") {
		run(`cd ${serverPath}bin`);
		run(`startup.bat`);
	} else {
		run(`${serverPath}bin${sep}startup.sh`);
	}
	while (true) {
		const pid = getServerPid(serverPath);
		if (isNaN(<any>pid)) {
			await waitFor(500);
		} else {
			entry.pid = pid;
			return Promise.resolve(pid);
		}
	}
}

export async function stopServer(entry: TomcatEntry, serverPath: PathLike) {
	return new Promise(async (res, rej) => {
		if (platform === "win32") {
			run(`cd ${serverPath}bin`);
			run(`shutdown.bat`);
		} else {
			run(`${serverPath}bin${sep}shutdown.sh`);
		}
		while (true) {
			const pid = getServerPid(serverPath);
			if (isNaN(<any>pid)) {
				delete entry.pid;
				res(entry.pid);
				break;
			} else {
				await waitFor(500);
			}
		}
	});
}

export function waitFor(ms: number) {
	return new Promise((res, rej) => {
		setTimeout(res, ms);
	});
}

export function getServerPid(serverPath: PathLike): number | null {
	try {
		return parseInt(cat(`${serverPath}logs${sep}tomcat.pid`) ?? "");
	} catch (error) {
		return null;
	}
}

export function cat(path: PathLike) {
	try {
		return fs.readFileSync(path).toString();
	} catch (error) {
		return null;
	}
}

export async function getXml(path: PathLike) {
	const text = cat(path);
	const result = await xml2js.parseStringPromise(text);

	return result;
}

export async function isProcessRunning(pid: number | string | undefined | null) {
	try {
		return (await (await find("pid", <number>pid)).length) > 0;
	} catch (err) {
		return false;
	}
}

export async function mvnCmd(projectRoot: string, command: string) {
	try {
		process.chdir(projectRoot);
		await run(`mvn ${command}`);
		process.chdir(__dirname);
		return Promise.resolve();
	} catch (err) {
		return Promise.reject(err);
	}
}

export function mvnPackage(projectRoot: string) {
	return mvnCmd(projectRoot, "clean package");
}

export function mvnInstall(projectRoot: string) {
	return mvnCmd(projectRoot, "clean install");
}

function setPermissions(serverPath: PathLike) {
	if (os.platform() === "win32") {
		return;
	}

	const bin = path.join(serverPath.toString(), "bin");
	run(`chmod +x ${bin + sep}startup.sh ${bin + sep}shutdown.sh ${bin + sep}catalina.sh`);
}

function setenv(serverPath: PathLike) {
	const catalinaPid = `CATALINA_PID="$CATALINA_BASE"${sep}logs${sep}tomcat.pid`;
	const catalinaOut = `CATALINA_OUT="$CATALINA_BASE${sep}logs${sep}catalina.log"`;
	const javaOpts = `export JAVA_OPTS="$JAVA_OPTS -Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=8081"`;

	fs.appendFileSync(
		path.join(serverPath.toString(), "bin", "setenv.sh"),
		`${catalinaPid}\n${catalinaOut}\n${javaOpts}`,
	);
}
