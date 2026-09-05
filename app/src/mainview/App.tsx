import { useCallback, useEffect, useState } from "react";
import type { AppState, LibrarySkill } from "../shared/types";
import { api, errorMessage } from "./rpc";
import { Install } from "./screens/Install";
import { Library } from "./screens/Library";
import { Onboarding } from "./screens/Onboarding";
import { SkillDetail } from "./screens/SkillDetail";

type Route = { name: "library" } | { name: "skill"; item: LibrarySkill } | { name: "install" };

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

	if (!state.onboarding.completed) {
		return <Onboarding state={state.onboarding} onChange={refresh} />;
	}

	if (route.name === "install") {
		return <Install onDone={() => setRoute({ name: "library" })} onCancel={() => setRoute({ name: "library" })} />;
	}

	if (route.name === "skill") {
		return <SkillDetail item={route.item} onBack={() => setRoute({ name: "library" })} />;
	}

	return (
		<Library
			state={state}
			onOpenSkill={(item) => setRoute({ name: "skill", item })}
			onInstall={() => setRoute({ name: "install" })}
			onAccountsChanged={refresh}
		/>
	);
}
