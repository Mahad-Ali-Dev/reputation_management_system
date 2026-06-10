import "../system-states.css";

/**
 * Dashboard loading skeleton — mirrors the real dashboard layout (hero banner,
 * KPI strip, today card + setup rail, quick actions, trend chart) so the page
 * doesn't jump when data lands. Pure CSS shimmer, no client JS.
 */
export default function DashboardLoading() {
  return (
    <div className="sys-load" aria-busy="true" aria-label="Loading dashboard">
      <div className="sys-load__inner">
        {/* Page header */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="sys-skel" style={{ height: 12, width: 120 }} />
          <div className="sys-skel" style={{ height: 30, width: 300, borderRadius: 10 }} />
          <div className="sys-skel" style={{ height: 14, width: 420, maxWidth: "90%" }} />
        </div>

        {/* Visibility-health hero banner */}
        <div className="sys-load__panel sys-load__hero">
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              className="sys-skel"
              style={{ height: 64, width: 64, borderRadius: "50%", flexShrink: 0 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <div className="sys-skel" style={{ height: 18, width: "40%" }} />
              <div className="sys-skel" style={{ height: 12, width: "65%" }} />
            </div>
            <div
              className="sys-skel"
              style={{ height: 38, width: 130, borderRadius: 999, flexShrink: 0 }}
            />
          </div>
        </div>

        {/* KPI strip */}
        <div className="sys-load__kpis">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sys-load__panel">
              <div className="sys-skel" style={{ height: 11, width: "55%" }} />
              <div className="sys-skel" style={{ height: 26, width: "40%", marginTop: 12 }} />
              <div className="sys-skel" style={{ height: 10, width: "70%", marginTop: 10 }} />
            </div>
          ))}
        </div>

        {/* Today card + setup rail */}
        <div className="sys-load__split">
          <div className="sys-load__panel">
            <div className="sys-skel" style={{ height: 16, width: 160 }} />
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}
              >
                <div
                  className="sys-skel"
                  style={{ height: 34, width: 34, borderRadius: 10, flexShrink: 0 }}
                />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                  <div className="sys-skel" style={{ height: 12, width: "50%" }} />
                  <div className="sys-skel" style={{ height: 10, width: "35%" }} />
                </div>
                <div
                  className="sys-skel"
                  style={{ height: 28, width: 72, borderRadius: 999, flexShrink: 0 }}
                />
              </div>
            ))}
          </div>
          <div className="sys-load__panel">
            <div className="sys-skel" style={{ height: 16, width: 120 }} />
            <div
              className="sys-skel"
              style={{ height: 88, width: 88, borderRadius: "50%", margin: "18px auto 0" }}
            />
            <div className="sys-skel" style={{ height: 10, width: "60%", margin: "16px auto 0" }} />
          </div>
        </div>

        {/* Rating-trend chart */}
        <div className="sys-load__panel">
          <div className="sys-skel" style={{ height: 16, width: 180 }} />
          <div className="sys-load__chart">
            {[42, 68, 55, 80, 62, 90, 74, 96, 84, 70, 88, 100].map((h, i) => (
              <div key={i} className="sys-skel sys-load__bar" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
