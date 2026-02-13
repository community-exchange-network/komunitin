import type { VueWrapper } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { vi } from "vitest";
import App from "../../../src/App.vue";
import { mountComponent, waitFor } from "../utils";
import { seeds } from "../../../src/server";

const { lineChartCalls } = vi.hoisted(() => ({
	lineChartCalls: [] as Array<{ options?: unknown; data?: unknown }>,
}));

vi.mock("vue-chartjs", () => ({
	Line: defineComponent({
		name: "MockLineChart",
		props: {
			options: { type: Object, required: true },
			data: { type: Object, required: true },
		},
		setup(props) {
			return () => {
				lineChartCalls.push({ options: props.options, data: props.data });
				return h("div", { "data-testid": "mock-line-chart" });
			};
		},
	}),
}));

const hasDataPoints = (expectedValues: number[]) => {
	return lineChartCalls.some((call) => {
		const points = (call.data as { datasets?: Array<{ data?: Array<{ y?: number }> }> } | undefined)
			?.datasets?.[0]?.data;
		const yValues = points?.map((point) => point.y);
		return JSON.stringify(yValues) === JSON.stringify(expectedValues);
	});
};

const hasMonthUnit = () => {
	return lineChartCalls.some((call) => {
		const options = call.options as { scales?: { x?: { time?: { unit?: string } } } } | undefined;
		return options?.scales?.x?.time?.unit === "month";
	});
};

describe("Stats", () => {
	let wrapper: VueWrapper;

	beforeAll(async () => {
		lineChartCalls.length = 0;
		wrapper = await mountComponent(App, { login: true });
		seeds();
	});

	afterAll(() => wrapper.unmount());

	it("renders stats page cards and charts", async () => {
		await wrapper.vm.$router.push("/groups/GRP0/stats");
		
		await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/stats", "Stats route should be active");
		
    // Since the stats values are loaded asynchronously, we wait for all of them independently.
    await waitFor(() => wrapper.text().includes("12K"), true, "Volume values should load");
		await waitFor(() => wrapper.text().includes("18.1%"), true, "Volume change should load");
		await waitFor(() => wrapper.text().includes("121"), true, "Active accounts value should load");
		await waitFor(() => wrapper.text().includes("-1.6%"), true, "Active accounts change should load");

		const text = wrapper.text();

		expect(text).toContain("GRP0");
    expect(text).toContain("Group 0");

    expect(text).toContain("Daily volume");
		expect(text).toContain("Monthly volume");
		expect(text).toContain("Yearly volume");
		expect(text).toContain("Total volume");
		expect(text).toContain("Active accounts");

    expect(lineChartCalls.length).toBeGreaterThanOrEqual(2);
		expect(hasDataPoints([120510000, 132150000, 140560000, 135120000, 148230000])).toBe(true);
    expect(hasDataPoints([60, 55, 58, 30, 41, 66, 64, 70])).toBe(true);
    expect(hasMonthUnit()).toBe(true);
	});
});
