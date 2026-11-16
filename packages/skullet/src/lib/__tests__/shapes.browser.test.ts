// Real localStorage: under Node 25, happy-dom's is shadowed by Node's own
import { afterEach, describe, expect, it } from "vitest";
import { Memory } from "../memory";
import { Reveal } from "../reveal";
import { bonesIn } from "@skullet/test-cases";
import {
  forgetShapes,
  recallShape,
  recallStored,
  rememberShape,
} from "../shapes";
import { restore } from "../snapshot";

const mount = (html: string) => {
  const element = document.body.appendChild(document.createElement("div"));
  element.innerHTML = html;
  return element;
};

const html = (markup: string) => {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content;
};

afterEach(() => {
  document.body.replaceChildren();
  forgetShapes();
});

describe("shapes", () => {
  it("keeps real text for a visit and only sizes across visits", () => {
    rememberShape("profile", mount(`<p>Ada Lovelace</p>`));
    expect(recallShape("profile")).toContain("Ada Lovelace");

    forgetShapes({ persisted: false });
    expect(recallShape("profile")).toBeNull();
    const { rects, width, height } = recallStored("profile")!;
    expect(rects).toHaveLength(1);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it("keeps an image's proportions, so a shape restored narrower scales it down", async () => {
    const shown = mount(
      `<img src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"/>')}" style="display: block; width: 100%">`,
    );
    shown.style.width = "400px";
    await shown.querySelector("img")!.decode();
    rememberShape("photo", shown);

    const narrow = mount("");
    narrow.style.width = "200px";
    narrow.append(restore(recallShape("photo")!));
    const box = narrow.querySelector("img")!.getBoundingClientRect();
    expect(box.width).toBeCloseTo(200, 0);
    expect(box.height).toBeCloseTo(100, 0);
  });

  it("forgets everything", () => {
    rememberShape("profile", mount(`<p>Ada</p>`));
    forgetShapes();
    expect(recallShape("profile")).toBeNull();
    expect(recallStored("profile")).toBeNull();
  });

  it("stores nothing of the content across visits", () => {
    rememberShape(
      "profile",
      mount(
        `<!-- alice --><a id="alice" class="user-alice" href="/alice" title="alice" data-handle="alice" style="--name: 'alice'; background: url(/alice.png)">alice Иван 💀</a><svg width="24" height="24"><title>alice</title></svg>`,
      ),
    );

    const stored = localStorage.getItem("skullet:shapes")!;
    expect(stored).not.toMatch(/alice|Иван|💀|<|class/);
  });

  it("saves nothing from content already shown when shapes are forgotten", async () => {
    const shown = mount(`<p>Ada</p>`);
    const memory = new Memory(shown, { id: "profile" });
    expect(recallShape("profile")).toContain("Ada");

    shown.append(document.createElement("p"));
    forgetShapes();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(recallShape("profile")).toBeNull();

    memory.destroy();
    expect(recallShape("profile")).toBeNull();
    expect(localStorage.getItem("skullet:shapes")).toBeNull();
  });

  it("remembers content shown after shapes are forgotten", () => {
    forgetShapes();
    const memory = new Memory(mount(`<p>Grace</p>`), { id: "profile" });
    expect(recallShape("profile")).toContain("Grace");
    memory.destroy();
  });

  it("stores no key as written", () => {
    rememberShape("/users/alice", mount(`<p>Hi</p>`));
    forgetShapes({ persisted: false });

    expect(localStorage.getItem("skullet:shapes")).not.toContain("alice");
    expect(recallStored("/users/alice")).not.toBeNull();
  });

  it("forgets when another tab does", async () => {
    const shown = mount(`<p>Ada</p>`);
    const memory = new Memory(shown, { id: "profile" });

    localStorage.removeItem("skullet:shapes");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "skullet:shapes",
        newValue: null,
        storageArea: localStorage,
      }),
    );
    expect(recallShape("profile")).toBeNull();

    memory.destroy();
    expect(localStorage.getItem("skullet:shapes")).toBeNull();
  });

  it("stores and reads nothing with persistence off", () => {
    const root = mount("");
    root.style.width = "300px";
    rememberShape("profile", mount(`<p>Earlier</p>`));
    forgetShapes({ persisted: false });
    const before = localStorage.getItem("skullet:shapes");

    const reveal = new Reveal(root, { id: "profile", persistence: false });
    reveal.load(html(`<p>Mine</p><p>Mine</p>`));
    expect(bonesIn(root)).toHaveLength(2);
    reveal.show(html(`<p>Ada</p>`));
    reveal.destroy();

    expect(localStorage.getItem("skullet:shapes")).toBe(before);
  });

  it("draws stored bones at their width, and skips them at another", () => {
    const shown = mount(`<p>One</p><p>Two</p>`);
    shown.style.width = "300px";
    rememberShape("list", shown);
    forgetShapes({ persisted: false });

    const load = (width: string) => {
      const root = mount("");
      root.style.width = width;
      const reveal = new Reveal(root, { id: "list" });
      reveal.load(html(`<p>Sample</p>`));
      const count = bonesIn(root).length;
      reveal.destroy();
      return count;
    };
    expect(load("300px")).toBe(2);
    forgetShapes({ persisted: false });
    expect(load("200px")).toBe(1);
  });

  it("reserves the same space under a scaled parent", () => {
    const scaled = (markup: string) => {
      const root = mount(markup);
      root.style.cssText = "width: 300px; transform: scale(0.5)";
      return root;
    };
    const shown = scaled(`<p style="margin: 0">One</p>`);
    rememberShape("dialog", shown);
    const { height } = shown.getBoundingClientRect();
    forgetShapes({ persisted: false });

    const root = scaled("");
    const reveal = new Reveal(root, { id: "dialog" });
    reveal.load(html(`<p>Sample</p><p>Sample</p><p>Sample</p>`));
    expect(root.getBoundingClientRect().height).toBeCloseTo(height, 0);
    reveal.destroy();
  });

  it("draws a card's background and outline under its stored bones", () => {
    const shown = mount(
      `<div class="card" style="padding: 8px; background: rgb(10, 20, 30); box-shadow: inset 0 0 0 1px rgb(1, 2, 3); border-radius: 8px"><p style="margin: 0">One</p><p style="margin: 0">Two</p></div>`,
    );
    shown.style.width = "300px";
    rememberShape("card", shown);
    forgetShapes({ persisted: false });

    expect(localStorage.getItem("skullet:shapes")).not.toContain('card"');
    const root = mount("");
    root.style.width = "300px";
    const reveal = new Reveal(root, { id: "card" });
    reveal.load();

    const surface = root.querySelector("[skullet-surface]")!;
    const style = getComputedStyle(surface);
    expect(style.visibility).toBe("visible");
    expect(style.backgroundColor).toBe("rgb(10, 20, 30)");
    expect(style.boxShadow).toContain("rgb(1, 2, 3)");
    expect(surface.getBoundingClientRect().width).toBe(300);
    expect(bonesIn(root)).toHaveLength(2);
    reveal.destroy();
  });

  it("stores no surface for a box a bone already draws", () => {
    const shown = mount(
      `<span style="display: inline-block; padding: 4px; background: rgb(10, 20, 30)">Chip</span>`,
    );
    shown.style.width = "300px";
    rememberShape("chip", shown);

    expect(recallStored("chip")!.surfaces).toHaveLength(0);
  });

  it("keeps the 50 most recent", () => {
    const element = mount(`<p>x</p>`);
    for (let i = 0; i < 55; i++) rememberShape(`shape-${i}`, element);
    forgetShapes({ persisted: false });

    expect(recallStored("shape-0")).toBeNull();
    expect(recallStored("shape-54")).not.toBeNull();
  });
});
