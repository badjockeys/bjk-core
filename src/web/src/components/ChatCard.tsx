import { barPercent, cardMax, pointValue } from "@/lib/chat";
import type { ChatCardDto, ChatCardPointDto } from "@/lib/types";

/**
 * The card under an answer, drawn from the query's rows (the API never lets the model write these figures). Figures
 * from fewer than 3 incidents arrive hidden and show as "fewer than 3".
 */
export function ChatCard({ card }: { card: ChatCardDto }) {
  return (
    <figure className="chat-card">
      {card.title ? <figcaption className="chat-card-title">{card.title}</figcaption> : null}
      {card.type === "Number" ? <NumberCard card={card} /> : null}
      {card.type === "Line" ? <LineCard card={card} /> : null}
      {card.type === "Bar" || card.type === "Places" ? (
        <BarCard card={card} numbered={card.type === "Places"} />
      ) : null}
      {card.type === "Table" ? <TableCard card={card} /> : null}
      {card.hiddenRows > 0 ? (
        <p className="small muted chat-card-note">
          {card.hiddenRows === 1
            ? "1 row had fewer than 3 reports, so its figures are hidden."
            : `${card.hiddenRows} rows had fewer than 3 reports, so their figures are hidden.`}
        </p>
      ) : null}
    </figure>
  );
}

function NumberCard({ card }: { card: ChatCardDto }) {
  const point = card.points[0];
  if (!point) {
    return null;
  }
  return (
    <div className="chat-number">
      <strong>{pointValue(point)}</strong>
      <span className="muted">{card.valueLabel ?? point.label}</span>
    </div>
  );
}

function BarCard({ card, numbered }: { card: ChatCardDto; numbered: boolean }) {
  const max = cardMax(card);
  const List = numbered ? "ol" : "ul";
  return (
    <List className="chat-bars">
      {card.points.map((point, i) => (
        <li key={`${point.label}-${i}`} className={point.hidden ? "chat-bar-hidden" : undefined}>
          <span className="chat-bar-label">{point.label}</span>
          <span className="chat-bar-track" aria-hidden="true">
            <span className="chat-bar-fill" style={{ width: `${barPercent(point, max)}%` }} />
          </span>
          <span className="chat-bar-value">{pointValue(point)}</span>
        </li>
      ))}
    </List>
  );
}

/** A trend: a line for sighted readers, and the same figures as a list for screen readers. */
function LineCard({ card }: { card: ChatCardDto }) {
  const points = card.points;
  if (points.length === 0) {
    return null;
  }
  const max = cardMax(card);
  const width = 300;
  const height = 96;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const y = (p: ChatCardPointDto) =>
    height - ((p.hidden || p.value === null ? 0 : p.value) / max) * (height - 8) - 4;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(p).toFixed(1)}`)
    .join(" ");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return (
    <div className="chat-line">
      <svg
        viewBox={`-4 0 ${width + 8} ${height}`}
        role="presentation"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={`${p.label}-${i}`}
            cx={i * step}
            cy={y(p)}
            r={3}
            fill={p.hidden ? "#FFFFFF" : "var(--brand)"}
            stroke="var(--brand)"
          />
        ))}
      </svg>
      <div className="chat-line-ends small muted" aria-hidden="true">
        <span>
          {first.label}: {pointValue(first)}
        </span>
        {points.length > 1 ? (
          <span>
            {last.label}: {pointValue(last)}
          </span>
        ) : null}
      </div>
      <ul className="sr-only">
        {points.map((p, i) => (
          <li key={`${p.label}-${i}`}>
            {p.label}: {pointValue(p)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableCard({ card }: { card: ChatCardDto }) {
  const columns = card.columns ?? [];
  const rows = card.rows ?? [];
  if (columns.length === 0) {
    return null;
  }
  return (
    <div className="chat-table-wrap">
      <table className="chat-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>{cell === "<3" ? "fewer than 3" : (cell ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
