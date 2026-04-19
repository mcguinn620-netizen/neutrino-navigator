import { Home, CalendarDays, Heart, BarChart3 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/today", label: "Today", icon: CalendarDays },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/week", label: "Week", icon: BarChart3 },
];

interface BottomTabBarProps {
  /** Extra bottom padding (e.g. when tray sheet is showing) */
  bottomOffsetClass?: string;
}

const BottomTabBar = ({ bottomOffsetClass }: BottomTabBarProps) => {
  const location = useLocation();
  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border pb-safe",
        bottomOffsetClass,
      )}
    >
      <div className="max-w-2xl mx-auto px-2 py-1 grid grid-cols-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = t.end ? location.pathname === t.to : location.pathname.startsWith(t.to);
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-colors",
                active ? "text-primary" : "text-muted-foreground active:text-foreground",
              )}
              aria-label={t.label}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
              <span className={cn("text-[10px] font-medium", active && "font-semibold")}>{t.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomTabBar;
