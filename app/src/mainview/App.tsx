import { useCallback, useEffect, useState } from "react";
import type { AppState, LibrarySkill } from "../shared/types";
import { api, errorMessage } from "./rpc";
import { Install } from "./screens/Install";
import { Library } from "./screens/Library";
import { Onboarding } from "./screens/Onboarding";
import { SkillDetail } from "./screens/SkillDetail";
import { Store } from "./screens/Store";
import { Usage } from "./screens/Usage";

type Route =
	| { name: "library" | "store" | "usage" }
	| { name: "skill"; item: LibrarySkill }
	| { name: "install"; url?: string };

const NAV: { name: "library" | "store" | "usage"; label: string }[] = [
	{ name: "library", label: "Library" },
	{ name: "store", label: "Store" },
	{ name: "usage", label: "Usage" },
];

export function App() {
	const [state, setState] = useState<AppState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [route, setRoute] = useState<Route>({ name: "library" });

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

	if (error) return <div className="page error">Failed to load app state: {error}</div>;
	if (!state) return <div className="page muted">Loading…</div>;
	if (!state.onboarding.completed) return <Onboarding state={state.onboarding} onChange={refresh} />;

	const toLibrary = () => setRoute({ name: "library" });

	let screen;
	switch (route.name) {
		case "install":
			screen = <Install initialUrl={route.url} onDone={toLibrary} onCancel={toLibrary} />;
			break;
		case "skill":
			screen = <SkillDetail item={route.item} onBack={toLibrary} />;
			break;
		case "store":
			screen = <Store onInstall={(url) => setRoute({ name: "install", url })} />;
			break;
		case "usage":
			screen = <Usage />;
			break;
		default:
			screen = (
				<Library
					state={state}
					onOpenSkill={(item) => setRoute({ name: "skill", item })}
					onInstall={() => setRoute({ name: "install" })}
					onAccountsChanged={refresh}
				/>
			);
	}

	return (
		<>
			<nav className="row" style={{ padding: "8px 24px", borderBottom: "1px solid #eee" }}>
				{NAV.map((n) => (
					<button key={n.name} onClick={() => setRoute({ name: n.name })} disabled={route.name === n.name}>
						{n.label}
					</button>
				))}
			</nav>
			{screen}
		</>
	);
}
