import { fill, voice } from "@wirelight/content";
import { type FormEvent, useState } from "react";
import { type LinkState, logsOn, setLogs, useAccount } from "./account";
import { accountsBuiltIn, sendLink, signOut } from "./supabase";
import "./account.css";

// Settings' account section (optional): sign in with a link sent by email (no password), sign out, and
// the switch that sends play logs (account/logs.ts). The switch is off at first, and can be switched on
// only while signed in; the privacy note below it says what it sends.

/** What Settings says about asking for a sign-in link, or finishing one. */
function linkNote(link: LinkState, sentTo: string | null): string | null {
  const t = voice.menu.account;
  if (link === "sent") return fill(t.sent, { email: sentTo ?? "" });
  if (link === "idle" || link === "sending") return null;
  return t[link];
}

export function AccountSettings() {
  const t = voice.menu.account;
  const account = useAccount((s) => s.account);
  const on = useAccount(logsOn);
  const link = useAccount((s) => s.link);
  const sentTo = useAccount((s) => s.sentTo);
  const waiting = useAccount((s) => s.waiting);
  const [email, setEmail] = useState("");

  if (!accountsBuiltIn)
    return (
      <>
        <h3>{t.title}</h3>
        <p className="panel-note">{t.unavailable}</p>
      </>
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void sendLink(email);
  };
  const note = account ? null : linkNote(link, sentTo);
  return (
    <section className="account" aria-labelledby="account-title">
      <h3 id="account-title">{t.title}</h3>
      {account ? (
        <>
          <p>{fill(t.signedIn, { email: account.email })}</p>
          <div className="panel-actions">
            <button type="button" className="quiet" onClick={() => void signOut()}>
              {t.signOut}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="panel-note">{t.about}</p>
          <form className="account-form" onSubmit={submit}>
            <label>
              <span>{t.email}</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button type="submit" disabled={link === "sending"}>
              {link === "sending" ? t.sending : t.send}
            </button>
          </form>
          {note && (
            <p className="panel-note" role="status">
              {note}
            </p>
          )}
        </>
      )}
      <label className="account-switch" data-available={account ? "yes" : "no"}>
        <input type="checkbox" checked={on} disabled={!account} onChange={(e) => setLogs(e.target.checked)} />
        <span>{t.logs}</span>
      </label>
      {!account && <p className="panel-note">{t.logsSignIn}</p>}
      {on && <p className="panel-note">{t.logsOn}</p>}
      {on && waiting > 0 && (
        <p className="panel-note">{waiting === 1 ? t.waitingOne : fill(t.waiting, { n: String(waiting) })}</p>
      )}
    </section>
  );
}
