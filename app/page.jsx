import { cookies } from "next/headers";
import { currentUser, sessionName } from "../server/auth.mjs";
import Workspace from "../components/Workspace.jsx";
import Login from "../components/Login.jsx";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser((await cookies()).get(sessionName)?.value);
  return user ? <Workspace user={user} /> : <Login />;
}
