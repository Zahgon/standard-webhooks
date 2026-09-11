import { describe, expect, it } from "vitest";

import { Webhook, WebhookVerificationException } from "../src/index";
import { SECRET_PREFIX } from "../src/index";
import { TestScenario } from "./testScenario";

/**
 * Unit tests for WebhookBase core logic.
 * Tests all business logic using the Webhook class.
 */
describe("WebhookTest", () => {
	const verify = (scenario: TestScenario) => () => {
		const webhook = new Webhook(scenario.secret);
		webhook.verify(scenario.payload, scenario.headersAsMap());
	};

	it("verifyValidPayloadAndHeaders", () => {
		const scenario = TestScenario.valid();
		const webhook = new Webhook(scenario.secret);

		webhook.verify(scenario.payload, scenario.headersAsMap());
	});

	it("verifyValidPayloadWithMultipleSignaturesIsValid", () => {
		const scenario = TestScenario.valid().withMultipleSignatures();

		const webhook = new Webhook(scenario.secret);
		webhook.verify(scenario.payload, scenario.headersAsMap());
	});

	it("verifyMissingIdThrowsException", () => {
		const scenario = TestScenario.valid().withMissingId();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifyMissingTimestampThrowsException", () => {
		const scenario = TestScenario.valid().withMissingTimestamp();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifyMissingSignatureThrowsException", () => {
		const scenario = TestScenario.valid().withMissingSignature();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifySignatureWithDifferentVersionThrowsException", () => {
		const scenario = TestScenario.valid().withWrongVersion();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifyMissingPartsInSignatureThrowsException", () => {
		const scenario = TestScenario.valid().withInvalidSignatureFormat();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifySignatureMismatchThrowsException", () => {
		const scenario = TestScenario.valid().withInvalidSignatureValue();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifyOldTimestampThrowsException", () => {
		const scenario = TestScenario.valid().withOldTimestamp();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifyNewTimestampThrowsException", () => {
		const scenario = TestScenario.valid().withFutureTimestamp();
		expect(verify(scenario)).toThrow(WebhookVerificationException);
	});

	it("verifySecretWorksWithOrWithoutPrefix", () => {
		const scenario = TestScenario.valid();

		let webhook = new Webhook(scenario.secret);
		webhook.verify(scenario.payload, scenario.headersAsMap());

		webhook = new Webhook(`${SECRET_PREFIX}${scenario.secret}`);
		webhook.verify(scenario.payload, scenario.headersAsMap());
	});

	it("verifyCaseInsensitiveHeaders", () => {
		const scenario = TestScenario.valid().withMixedCaseHeaders();

		const webhook = new Webhook(scenario.secret);
		webhook.verify(scenario.payload, scenario.headersAsMap());
	});

	it("verifyWebhookSignWorks", () => {
		const scenario = TestScenario.validSigned();
		const webhook = new Webhook(scenario.secret);
		const signature = webhook.sign(scenario.id, Number(scenario.timestamp), scenario.payload);
		expect(signature).toEqual(scenario.signature);
	});
});
