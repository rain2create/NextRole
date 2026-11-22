import Link from "next/link";
import { Compass, LayoutGrid, Mail } from "lucide-react";
import { Logo } from "./ui";
import { AppearanceMenu } from "../../appearance";

export function AppHeader({ active }: { active: "workspace" | "tracking" | "email" }) {
  return (
    <header className="app-header">
      <Link href="/app" className="flex shrink-0 items-center gap-3" aria-label="NextRole 求职工作台">
        <span className="brand-mark"><Logo /></span>
        <span className="text-[23px] font-semibold tracking-[-.045em]">Next<span className="text-accent">Role</span></span>
      </Link>
      <nav className="app-nav" aria-label="主导航">
        {([
          ["workspace", "/app", "求职工作台", Compass],
          ["tracking", "/app/tracking", "申请管理", LayoutGrid],
          ["email", "/app/email", "邮件投递", Mail],
        ] as const).map(([key, href, label, Icon]) => (
          <Link key={key} href={href} aria-current={active === key ? "page" : undefined}><Icon size={15} aria-hidden />{label}</Link>
        ))}
      </nav>
      <AppearanceMenu />
    </header>
  );
}
