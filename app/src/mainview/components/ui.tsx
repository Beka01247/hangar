import type { ReactNode } from "react";

export function Icon({ name, size = 16, stroke = "currentColor" }: { name: string; size?: number; stroke?: string }) {
	const paths: Record<string, string> = {
		library: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
		usage: '<path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/>',
		mark: '<path d="M12 2l9 4.5v9L12 20l-9-4.5v-9L12 2z"/>',
		check: '<path d="M5 12l5 5L20 7"/>',
		back: '<path d="M15 6l-6 6 6 6"/>',
		up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		external: '<path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6"/>',
		chevron: '<path d="M6 9l6 6 6-6"/>',
		copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 011-1h10"/>',
	};
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={stroke}
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			dangerouslySetInnerHTML={{ __html: paths[name] ?? "" }}
		/>
	);
}

export function Button({
	variant = "default",
	size,
	className = "",
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "white"; size?: "sm" }) {
	const cls = ["btn", variant !== "default" && `btn-${variant}`, size === "sm" && "btn-sm", className].filter(Boolean).join(" ");
	return <button type="button" {...props} className={cls} />;
}

export function Panel({ children, className = "", red = false, style }: { children: ReactNode; className?: string; red?: boolean; style?: React.CSSProperties }) {
	return (
		<div className={`${red ? "panel-red" : "panel"} ${className}`} style={style}>
			{children}
		</div>
	);
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
	return <button type="button" className={`toggle ${on ? "on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function Segment<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
	return (
		<div className="segment">
			{options.map((o) => (
				<button key={o.value} type="button" className={o.value === value ? "active" : ""} onClick={() => onChange(o.value)}>
					{o.label}
				</button>
			))}
		</div>
	);
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal rise" onClick={(e) => e.stopPropagation()}>
				{children}
			</div>
		</div>
	);
}

export function Tile({ tone = "gray", size = 54 }: { tone?: "red" | "gray" | "purple" | "green"; size?: number }) {
	return <div className={`icon-tile ${tone === "gray" ? "" : tone}`} style={{ width: size, height: size, borderRadius: size * 0.3 }} />;
}

export function tileTone(seed: string): "red" | "gray" | "purple" | "green" {
	const tones = ["red", "gray", "purple", "green"] as const;
	let h = 0;
	for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return tones[h % tones.length]!;
}

export function money(usd: number): string {
	return `$${usd.toFixed(2)}`;
}
