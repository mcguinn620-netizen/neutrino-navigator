import { Outlet } from "react-router-dom";
import BottomTabBar from "./BottomTabBar";
import TrayBar from "./TrayBar";
import { useAppStore } from "@/lib/store";

const AppLayout = () => {
  const trayCount = useAppStore((s) => s.tray.length);
  // When tray pill is visible, push content up so nothing hides behind it
  const contentBottomPadding = trayCount > 0 ? "pb-[200px]" : "pb-28";

  return (
    <div className={`min-h-screen bg-background ${contentBottomPadding}`}>
      <Outlet />
      <TrayBar />
      <BottomTabBar />
    </div>
  );
};

export default AppLayout;
