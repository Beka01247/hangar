import { useCallback, useEffect, useState } from "react";
import type { AppState, LibrarySkill } from "../shared/types";
import { Icon } from "./components/ui";
import { api, errorMessage } from "./rpc";
import { InstallDialog } from "./screens/InstallDialog";
import { Library } from "./screens/Library";
import { Onboarding } from "./screens/Onboarding";
import { SkillDetail } from "./screens/SkillDetail";
import { Store } from "./screens/Store";
import { Usage } from "./screens/Usage";

type Section = "library" | "store" | "usage";
type Route = { name: Section } | { name: "skill"; item: LibrarySkill };

const NAV: { name: Section; label: string; icon: string }[] = [
	{ name: "library", label: "Library", icon: "library" },
	{ name: "store", label: "Store", icon: "search" },
	{ name: "usage", label: "Usage", icon: "usage" },
];

export function App() {
	const [state, setState] = useState<AppState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [route, setRoute] = useState<Route>({ name: "library" });
	const [install, setInstall] = useState<{ url?: string } | null>(null);

	const refresh = useCallback(async () => {
		try {
			setState(await api.getAppState());
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (error) return <div className="app"><div className="main error">Failed to load app state: {error}</div></div>;
	if (!state) return <div className="app" />;
	if (!state.onboarding.completed) {
		return (
			<div className="app">
				<div className="glow glow-a" style={{ left: 420, top: -300, width: 1100, height: 1000 }} />
				<Onboarding state={state.onboarding} onChange={refresh} />
			</div>
		);
	}

	const toLibrary = () => setRoute({ name: "library" });
	const openInstall = (url?: string) => setInstall({ url });
	const section: Section = route.name === "skill" ? "library" : route.name;

	let screen;
	switch (route.name) {
		case "skill":
			screen = <SkillDetail item={route.item} onBack={toLibrary} />;
			break;
		case "store":
			screen = <Store onInstall={openInstall} />;
			break;
		case "usage":
			screen = <Usage />;
			break;
		default:
			screen = <Library state={state} onOpenSkill={(item) => setRoute({ name: "skill", item })} onInstall={() => openInstall()} onAccountsChanged={refresh} />;
	}

	return (
		<div className="app">
			<div className="glow glow-a" />
			<div className="glow glow-b" />
			<div className="shell">
				<aside className="sidebar panel">
					<div className="brand">
						<span className="mark"><Icon name="mark" size={14} stroke="#fff" /></span>
						Hangar
					</div>
					{NAV.map((n) => (
						<button key={n.name} className={`nav-item ${section === n.name ? "active" : ""}`} onClick={() => setRoute({ name: n.name })}>
							<Icon name={n.icon} />
							{n.label}
						</button>
					))}
					<div className="grow" />
					<div className="account">
						{state.onboarding.github?.avatarUrl ? <img className="avatar" src={state.onboarding.github.avatarUrl} alt="" /> : <div className="avatar" />}
						<div className="stack" style={{ minWidth: 0 }}>
							<span className="small" style={{ fontWeight: 500 }}>{state.onboarding.github?.login ?? "—"}</span>
							<span className="tiny dim">Claude · {state.onboarding.claudeAuthMode === "api-key" ? "API key" : "subscription"}</span>
						</div>
					</div>
				</aside>
				{screen}
			</div>
			{install && <InstallDialog initialUrl={install.url} onClose={() => setInstall(null)} onInstalled={() => { setInstall(null); setRoute({ name: "library" }); }} />}
		</div>
	);
}
