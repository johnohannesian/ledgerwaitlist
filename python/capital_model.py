"""
Single-page Capital & Profit Model for trading card market-making.
Run: streamlit run capital_model.py
"""

import pandas as pd
import streamlit as st

# ─── Page config & dark theme ─────────────────────────────────────────────
st.set_page_config(
    page_title="Capital Model | LedgerEngine",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown("""
<style>
  /* Dark finance dashboard theme */
  .stApp { background: linear-gradient(180deg, #0d1117 0%, #161b22 100%); }
  h1, h2, h3 { color: #e6edf3 !important; font-weight: 600; }
  p, .stMarkdown { color: #8b949e; }
  label { color: #c9d1d9 !important; }
  .stSlider label { color: #c9d1d9 !important; }
  
  /* Metric cards */
  .metric-card {
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .metric-card h4 { color: #8b949e; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.25rem 0; }
  .metric-card .value { color: #58a6ff; font-size: 1.75rem; font-weight: 700; }
  .metric-card .value.positive { color: #3fb950; }
  .metric-card .value.warning { color: #d29922; }
  
  /* YC Pitch highlight */
  .pitch-highlight { background: linear-gradient(135deg, #238636 0%, #2ea043 20%, #21262d 100%); border: 1px solid #3fb950; border-radius: 12px; padding: 1rem 1.5rem; }
  .pitch-highlight .value { color: #fff !important; }
  
  /* Sensitivity table */
  .sensitivity-table { font-size: 0.9rem; }
  div[data-testid="stDataFrame"] { border-radius: 8px; overflow: hidden; border: 1px solid #30363d; }
  
  /* Toggle */
  .stToggle { margin-bottom: 1rem; }
</style>
""", unsafe_allow_html=True)


def main():
    st.title("Capital & Profit Model")
    st.caption("Hybrid liquidity model: LOI sourcing + eBay spread · High-frequency market-making")

    # ─── YC Pitch Mode toggle (affects defaults and highlight) ───────────
    pitch_mode = st.toggle("YC Pitch Mode", value=False, help="Lock to $218M volume, 5% capture, 10% yield")
    st.divider()

    # ─── Sliders ──────────────────────────────────────────────────────────
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        default_vol = 218 if pitch_mode else 218
        volume_m = st.slider(
            "Total Monthly Market Volume ($M)",
            min_value=50.0,
            max_value=500.0,
            value=float(default_vol),
            step=5.0,
            format="$%.0fM",
            help="eBay-style total addressable market per month",
        )
    with col2:
        default_capture = 5.0 if pitch_mode else 2.0
        capture_pct = st.slider(
            "Market Capture %",
            min_value=0.1,
            max_value=25.0,
            value=default_capture,
            step=0.1,
            format="%.1f%%",
            help="Share of market we actually execute",
        )
    with col3:
        default_yield_pct = 10.0 if pitch_mode else 8.0
        yield_pct = st.slider(
            "Total Yield %",
            min_value=1.0,
            max_value=20.0,
            value=default_yield_pct,
            step=0.5,
            format="%.1f%%",
            help="Sourcing alpha + bid/ask spread",
        )
    with col4:
        default_turnover = 30 if pitch_mode else 14
        turnover_days = st.slider(
            "Inventory Turnover (Days)",
            min_value=2,
            max_value=60,
            value=default_turnover,
            step=1,
            help="Lower = higher velocity, less capital required",
        )

    # ─── Core formulas ───────────────────────────────────────────────────
    volume_dollars = volume_m * 1_000_000
    monthly_volume_captured = volume_dollars * (capture_pct / 100)
    monthly_gross_profit = monthly_volume_captured * (yield_pct / 100)
    annual_run_rate = monthly_gross_profit * 12
    # Required working capital: we need to fund (volume_captured) scaled by how long we hold
    required_working_capital = monthly_volume_captured * (turnover_days / 30)
    monthly_roi_pct = (monthly_gross_profit / required_working_capital * 100) if required_working_capital > 0 else 0.0

    # ─── Output metrics (dynamic cards) ──────────────────────────────────
    st.subheader("Output metrics")
    is_pitch_scenario = pitch_mode and volume_m == 218 and capture_pct == 5.0 and yield_pct == 10.0

    m1, m2, m3, m4 = st.columns(4)
    with m1:
        card_class = "pitch-highlight" if is_pitch_scenario else "metric-card"
        st.markdown(f"""
        <div class="{card_class}">
          <h4>Monthly Gross Profit</h4>
          <div class="value positive">${monthly_gross_profit:,.0f}</div>
        </div>
        """, unsafe_allow_html=True)
    with m2:
        st.markdown(f"""
        <div class="metric-card">
          <h4>Annualized Run Rate</h4>
          <div class="value positive">${annual_run_rate:,.0f}</div>
        </div>
        """, unsafe_allow_html=True)
    with m3:
        st.markdown(f"""
        <div class="metric-card">
          <h4>Required Working Capital</h4>
          <div class="value">${required_working_capital:,.0f}</div>
        </div>
        """, unsafe_allow_html=True)
    with m4:
        st.markdown(f"""
        <div class="metric-card">
          <h4>Monthly ROI on Capital</h4>
          <div class="value {'positive' if monthly_roi_pct >= 10 else 'warning'}">{monthly_roi_pct:.1f}%</div>
        </div>
        """, unsafe_allow_html=True)

    if pitch_mode and not is_pitch_scenario:
        st.info("Adjust sliders to match YC Pitch scenario: $218M volume, 5% capture, 10% yield.")

    st.divider()
    st.subheader("Sensitivity: Monthly profit by capture & yield")
    st.caption("Market volume = current slider value. Profit = (Volume × Capture %) × Yield %.")

    # ─── Sensitivity table: Capture (rows) vs Yield (columns) ──────────────
    capture_levels = [1.0, 5.0, 10.0, 15.0]
    yield_levels = [5.0, 10.0, 15.0]
    rows = []
    for cap in capture_levels:
        row = {"Market Capture": f"{cap:.0f}%"}
        for y in yield_levels:
            profit = (volume_dollars * (cap / 100)) * (y / 100)
            row[f"Yield {y:.0f}%"] = f"${profit:,.0f}"
        rows.append(row)

    sens_df = pd.DataFrame(rows)
    st.dataframe(sens_df.set_index("Market Capture"), use_container_width=True, hide_index=True)

    # Highlight YC cell (5% capture, 10% yield) in the table via column config
    st.caption("Pitch scenario (5% capture, 10% yield) is one cell in the table above.")

    st.divider()
    st.markdown("""
    **Validation note:** Required Working Capital = (Monthly volume captured) × (Turnover days / 30).  
    Higher velocity (lower turnover days) means less cash on hand to generate the same profit.
    """)


if __name__ == "__main__":
    main()
