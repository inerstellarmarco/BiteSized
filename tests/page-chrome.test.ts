import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

describe("PageHeader", () => {
  it("renders eyebrow, title, and description", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, { eyebrow: "Hello, Eric", title: "Pick up the next card.", description: "Short lessons." }),
    );
    expect(html).toContain("Hello, Eric");
    expect(html).toContain("<h1");
    expect(html).toContain("Pick up the next card.");
    expect(html).toContain("Short lessons.");
  });

  it("leaves out the optional lines when they are not given", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { title: "Settings" }));
    expect(html).toContain("Settings");
    expect(html).not.toContain("text-muted-foreground");
  });
});

describe("EmptyState", () => {
  it("renders title, body, and the action", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "No course is loaded yet",
        body: "Import a course to start learning.",
        action: createElement("a", { href: "/admin/import" }, "Import a Google Doc"),
      }),
    );
    expect(html).toContain("No course is loaded yet");
    expect(html).toContain("Import a course to start learning.");
    expect(html).toContain('href="/admin/import"');
  });

  it("renders without an action", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { title: "Nothing here" }));
    expect(html).toContain("Nothing here");
    expect(html).not.toContain("<a");
  });
});
