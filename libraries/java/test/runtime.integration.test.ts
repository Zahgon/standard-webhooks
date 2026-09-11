import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TestScenario } from "./testScenario";

/**
 * Runtime integration tests.
 *
 * These are the counterpart of the original's Java 8 and Java 11 integration
 * suites. Like those, they exercise the **built artifact** rather than the
 * source tree: the original points surefire at the packaged JAR and at a
 * deliberately non-existent classes directory so that multi-release resolution
 * is what is actually tested. Here that means loading `dist/`, the output of
 * `tsc`, through the package's declared entry point.
 *
 * The original's two pairs of assertions were "we are on the expected runtime"
 * and "the class we loaded was built for that runtime" (bytecode major 52 for
 * Java 8, 55 for Java 11). Bytecode major versions have no counterpart outside
 * the JVM; the contract they encode — the shipped artifact is built for the
 * language level the package declares, and exposes the API appropriate to the
 * runtime — is what carries over.
 */

const packageRoot = resolve(__dirname, "..");
const require = createRequire(__filename);

interface PackageManifest {
	main: string;
	types: string;
	type: string;
	engines: { node: string };
}

interface TsConfig {
	compilerOptions: { target: string; module: string; declaration: boolean };
}

const manifest = JSON.parse(
	readFileSync(resolve(packageRoot, "package.json"), "utf8"),
) as PackageManifest;

const tsconfig = JSON.parse(
	readFileSync(resolve(packageRoot, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""),
) as TsConfig;

// Load the built artifact through the entry point the manifest advertises,
// exactly as a consumer would.
const builtEntry = resolve(packageRoot, manifest.main);
const built = require(builtEntry) as typeof import("../src/index");

describe("WebhookRuntimeIntegrationTest", () => {
	it("verifyRunningOnSupportedRuntime", () => {
		const required = manifest.engines.node;
		const minimumMajor = Number(/(\d+)/.exec(required)?.[1]);
		const actualMajor = Number(process.versions.node.split(".")[0]);

		expect(
			actualMajor >= minimumMajor,
			`Expected Node ${required}, but got Node version: ${process.versions.node}`,
		).toBe(true);
	});

	it("verifyLoadedArtifactMatchesDeclaredLanguageLevel", () => {
		// The JVM equivalent read the class-file major version off the loaded
		// class. The observable analogue is that the emitted module format and
		// language level match what the package declares to consumers.
		expect(tsconfig.compilerOptions.target).toEqual("ES2022");
		expect(tsconfig.compilerOptions.module).toEqual("commonjs");
		expect(manifest.type).toEqual("commonjs");

		const emitted = readFileSync(builtEntry, "utf8");
		expect(emitted).toContain("exports.");
		expect(emitted).not.toContain("import {");

		// Declarations must ship alongside the JavaScript, or consumers get `any`.
		expect(() => readFileSync(resolve(packageRoot, manifest.types), "utf8")).not.toThrow();
	});

	it("verifyLoadedArtifactVerifiesThroughGenericHeaderMap", () => {
		const scenario = TestScenario.valid();
		const webhook = new built.Webhook(scenario.secret);

		expect(() => {
			webhook.verify(scenario.payload, scenario.headersAsMap());
		}).not.toThrow();

		expect(webhook.sign(scenario.id, Number(scenario.timestamp), scenario.payload)).toEqual(
			scenario.signatureHeader(),
		);
	});

	it("verifyLoadedArtifactVerifiesThroughNativeHeaders", () => {
		// Counterpart of the Java 11 build's `verify(String, HttpHeaders)`
		// overload: the platform's own header container is accepted directly.
		const scenario = TestScenario.valid();
		const webhook = new built.Webhook(scenario.secret);

		expect(() => {
			webhook.verify(scenario.payload, scenario.headersAsFetchHeaders());
		}).not.toThrow();

		const tampered = TestScenario.valid().withInvalidSignatureValue();
		expect(() => {
			new built.Webhook(tampered.secret).verify(
				tampered.payload,
				tampered.headersAsFetchHeaders(),
			);
		}).toThrow(built.WebhookVerificationException);
	});
});
