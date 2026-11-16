import { type CSSProperties, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { forgetShapes } from "skullet";
import { recallStored } from "skullet/internal";
import { Skeleton } from "skullet/react";

import styles from "./styles.module.scss";
import { CodeBlock } from "@/components/codeblock";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, Field } from "../parts";

const LOAD = 1500;
const SETTLE = 800;
const DATA = {
  title: "Quarterly planning notes",
  body: "Everything the team agreed on this quarter, with who is doing what and when it should land.",
  meta: "Updated today",
};

type Data = typeof DATA;
type Size = { width: number; height: number };

const Rows = ({ title, body }: Data) => (
  <div className={styles.rows}>
    {[title, body, body].map((text, index) => (
      <p key={index}>{text}</p>
    ))}
  </div>
);

const Card = ({ title, body, meta }: Data) => (
  <div className={styles.card}>
    <h4>{title}</h4>
    <p>{body}</p>
    <span>{meta}</span>
  </div>
);

const Panel = ({ title, body }: Data) => (
  <div className={styles.panel}>
    <h4>{title}</h4>
    <p>{body}</p>
  </div>
);

const sizeOf = (element: HTMLElement): Size => {
  const { width, height } = element.getBoundingClientRect();
  return { width: Math.round(width), height: Math.round(height) };
};

const sourceOf = (stage: HTMLElement) => {
  const snapshot = stage.querySelector("[skullet-snapshot]");
  if (snapshot?.textContent?.trim()) return "this visit’s memory";
  if (snapshot?.querySelector("[skullet-block]")) return "generic lines";
  return stage.querySelector("[skullet-ghost][skullet-inactive]")
    ? "stored bones"
    : "children";
};

/** A return visit: the stored shape only, as no memory of this one survives a real reload. */
function StoredCase<T extends number>({
  id,
  title,
  detail,
  options = [],
  label,
  first,
  next: firstNext,
  stage,
  children,
}: {
  id: string;
  title?: string;
  detail?: string;
  options?: readonly T[];
  label?: string;
  first?: T;
  next?: T;
  stage?: (option?: T) => CSSProperties;
  children: (data: Data) => React.ReactNode;
}) {
  const [applied, setApplied] = useState(first);
  const [next, setNext] = useState(firstNext);
  const [visit, setVisit] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [shown, setShown] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const shape = recallStored(id);
      if (shape) setSaved(JSON.stringify(shape, null, 2));
    });
    return () => cancelAnimationFrame(frame);
  }, [id]);

  const measure = () => {
    const skeleton = sizeOf(element.current!);
    const source = sourceOf(element.current!);
    setSaved(JSON.stringify(recallStored(id), null, 2));
    setShown(true);
    setTimeout(() => {
      const content = sizeOf(element.current!);
      const moved = Math.abs(content.height - skeleton.height);
      setResult(
        `Drawn from ${source}: ${skeleton.width}×${skeleton.height}, content ${content.width}×${content.height}, moved ${moved}px`,
      );
      setBusy(false);
    }, SETTLE);
  };

  const returnVisit = () => {
    setBusy(true);
    setResult(null);
    // Mounted fresh to save, as this page's own checks forget every shape as it loads
    flushSync(() => setVisit((count) => count + 1));
    // Unmounted before forgetting: leaving saves the shape to memory too, which a reload wouldn't keep
    flushSync(() => setMounted(false));
    forgetShapes({ persisted: false });
    setApplied(next);
    setShown(false);
    setVisit((count) => count + 1);
    setMounted(true);
    setTimeout(measure, LOAD);
  };

  return (
    <div className={styles.case} data-case={id}>
      {title && <h3>{title}</h3>}
      {detail && <p>{detail}</p>}
      <div className={styles.panel}>
        <div className={styles.preview}>
          <div ref={element} className={styles.stage} style={stage?.(applied)}>
            {mounted && (
              <Skeleton key={visit} id={id} data={shown ? DATA : null}>
                {children}
              </Skeleton>
            )}
          </div>
        </div>
        <div className={styles.saved}>
          <CodeBlock code={saved ?? "Nothing stored yet."} />
        </div>
        <div className={styles.controls}>
          {options.length > 0 && next !== undefined && (
            <Field label={label ?? ""}>
              <SegmentedControl
                label={label ?? ""}
                options={options}
                value={next}
                onChange={setNext}
                format={(option) => `${option}px`}
              />
            </Field>
          )}
          <Button onClick={returnVisit} disabled={busy}>
            Return visit
          </Button>
          {result && <p className={styles.result}>{result}</p>}
        </div>
      </div>
    </div>
  );
}

/** The docs' one card: what a return visit draws, and the data it's drawn from. */
export const MemoryDemo = () => (
  <StoredCase id="docs-memory">{(data) => <Card {...data} />}</StoredCase>
);

/** What bones stored without markup can and can't do, to try on a return visit. */
export function StoredShapesDemo() {
  return (
    <div className={styles.cases}>
      <StoredCase
        id="lab-stored-width"
        title="Another width, no sample"
        detail="Stored at 320px. Return at 220px, and with no sample the skeleton is generic lines, so the content moves."
        label="Next visit"
        options={[320, 220] as const}
        first={320}
        next={220}
        stage={(width) => ({ width })}
      >
        {(data) => <Rows {...data} />}
      </StoredCase>
      <StoredCase
        id="lab-stored-card"
        title="A card’s surface"
        detail="A card with several labels keeps its background and outline, stored as colours and a box, under its bones."
      >
        {(data) => <Card {...data} />}
      </StoredCase>
      <StoredCase
        id="lab-stored-height"
        title="A height set by the page"
        detail="Stored at 120px. The width still matches, so the stored height is used even at 220px, and the content moves."
        label="Next visit"
        options={[120, 220] as const}
        first={120}
        next={220}
        stage={(height) => ({ "--panel": `${height}px` }) as CSSProperties}
      >
        {(data) => <Panel {...data} />}
      </StoredCase>
    </div>
  );
}
