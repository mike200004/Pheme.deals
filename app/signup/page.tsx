import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="authWrap" style={{ maxWidth: 520 }}>
      <div className="authLogo">
        <Image src="/pheme-mark.png" alt="Pheme" width={1402} height={1122} priority />
      </div>
      <h1 className="pageTitle">Pheme is invitation only</h1>
      <p className="pageSub">
        New accounts require an invitation. If you have been invited,
        use the secure link in your invitation email to get started.
      </p>
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}
