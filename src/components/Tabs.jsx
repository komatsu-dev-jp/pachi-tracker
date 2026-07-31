import { createElement, lazy, Suspense } from "react";

const LazyDataTab = lazy(() => import("./tabs/DataTab").then((module) => ({ default: module.DataTab })));
const LazyRotTab = lazy(() => import("./tabs/RotTab").then((module) => ({ default: module.RotTab })));
const LazyHistoryTab = lazy(() => import("./tabs/HistoryTab").then((module) => ({ default: module.HistoryTab })));
const LazyCalendarTab = lazy(() => import("./tabs/CalendarTab").then((module) => ({ default: module.CalendarTab })));
const LazySettingsTab = lazy(() => import("./tabs/SettingsTab").then((module) => ({ default: module.SettingsTab })));

function TabLoading() {
  return (
    <div role="status" aria-live="polite" style={{ padding: 24, color: "var(--text-sub)", textAlign: "center" }}>
      画面を読み込んでいます…
    </div>
  );
}

function LazyTab({ component, props }) {
  return (
    <Suspense fallback={<TabLoading />}>
      {createElement(component, props)}
    </Suspense>
  );
}

export function DataTab(props) {
  return <LazyTab component={LazyDataTab} props={props} />;
}

export function RotTab(props) {
  return <LazyTab component={LazyRotTab} props={props} />;
}

export function HistoryTab(props) {
  return <LazyTab component={LazyHistoryTab} props={props} />;
}

export function CalendarTab(props) {
  return <LazyTab component={LazyCalendarTab} props={props} />;
}

export function SettingsTab(props) {
  return <LazyTab component={LazySettingsTab} props={props} />;
}
