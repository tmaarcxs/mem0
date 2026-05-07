"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  GalleryVerticalEnd,
  KeyRound,
  Network,
  Search,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

const activityItems: NavItem[] = [
  {
    title: "Graph",
    url: "/dashboard/graph",
    icon: Network,
  },
  {
    title: "Retrieval",
    url: "/dashboard/retrieval",
    icon: Search,
  },
  {
    title: "Requests",
    url: "/dashboard/requests",
    icon: Activity,
  },
  {
    title: "Memories",
    url: "/dashboard/memories",
    icon: GalleryVerticalEnd,
  },
  {
    title: "Entities",
    url: "/dashboard/entities",
    icon: Users,
  },
];

const adminItems: NavItem[] = [
  {
    title: "API Keys",
    url: "/dashboard/api-keys",
    icon: KeyRound,
  },
  {
    title: "Configuration",
    url: "/dashboard/configuration",
    icon: Wrench,
  },
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings,
  },
];

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const isSidebarCollapsed = useSelector(
    (state: RootState) => state.layout.isSidebarCollapsed,
  );

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          collapsed={isSidebarCollapsed}
          active={pathname === item.url}
          tooltip={isSidebarCollapsed ? item.title : undefined}
        >
          <Link
            href={item.url}
            className={cn(
              "flex items-center w-full",
              isSidebarCollapsed ? "justify-center mx-auto" : "gap-1.5",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {!isSidebarCollapsed && <span>{item.title}</span>}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar
      collapsible={isSidebarCollapsed ? "icon" : undefined}
      className={cn(className, "border-r-0 w-full mb-0 bg-transparent")}
      {...props}
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-0">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0">
                {!isSidebarCollapsed && (
                  <SidebarGroupLabel className="mb-0">
                    MEMORY ATLAS
                  </SidebarGroupLabel>
                )}
                {renderItems(activityItems)}
              </div>

              {isSidebarCollapsed && (
                <div className="h-[1px] w-full bg-memBorder-primary my-2" />
              )}

              <div className="flex flex-col gap-0">
                {!isSidebarCollapsed && (
                  <SidebarGroupLabel className="mb-0">
                    OPERATIONS
                  </SidebarGroupLabel>
                )}
                {renderItems(adminItems)}
              </div>
            </div>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
