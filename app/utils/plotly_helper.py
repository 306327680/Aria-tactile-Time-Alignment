"""
Plotly visualization helper functions
"""

import json
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def create_plotly_figure(aligner, segments=None):
    """
    Create interactive Plotly figure for alignment visualization.

    Args:
        aligner: AriaHapticAligner instance with alignment results
        segments: Optional list of (split_time, segment_index) tuples

    Returns:
        Plotly figure as JSON
    """
    print(f"DEBUG: Creating plotly figure")
    print(f"DEBUG: Aria data points: {len(aligner.aria_timestamps)}")
    print(f"DEBUG: Haptic data points: {len(aligner.haptic_timestamps)}")
    print(f"DEBUG: Aria time range: {aligner.aria_timestamps[0]:.3f} - {aligner.aria_timestamps[-1]:.3f}")
    print(f"DEBUG: Haptic time range: {aligner.haptic_timestamps[0]:.3f} - {aligner.haptic_timestamps[-1]:.3f}")
    print(f"DEBUG: Aria distance range: {aligner.aria_distance.min():.6f} - {aligner.aria_distance.max():.6f}")
    print(f"DEBUG: Haptic force range: {aligner.haptic_force.min():.6f} - {aligner.haptic_force.max():.6f}")

    # Check for valid data
    if len(aligner.aria_timestamps) == 0 or len(aligner.haptic_timestamps) == 0:
        raise ValueError("Empty data arrays provided")

    # Normalize signals with safety checks
    aria_distance_range = aligner.aria_distance.max() - aligner.aria_distance.min()
    haptic_force_range = aligner.haptic_force.max() - aligner.haptic_force.min()

    if aria_distance_range <= 0:
        print(f"WARNING: Aria distance range is zero or negative: {aria_distance_range}")
        aria_norm = np.zeros_like(aligner.aria_distance)
    else:
        aria_norm = (aligner.aria_distance - aligner.aria_distance.min()) / aria_distance_range

    if haptic_force_range <= 0:
        print(f"WARNING: Haptic force range is zero or negative: {haptic_force_range}")
        haptic_norm = np.zeros_like(aligner.haptic_force)
    else:
        haptic_norm = (aligner.haptic_force - aligner.haptic_force.min()) / haptic_force_range

    # Check for NaN values
    if np.any(np.isnan(aria_norm)) or np.any(np.isnan(haptic_norm)):
        print("WARNING: NaN values detected in normalized data")
        aria_norm = np.nan_to_num(aria_norm, nan=0.0)
        haptic_norm = np.nan_to_num(haptic_norm, nan=0.0)

    aria_inverted = 1.0 - aria_norm

    print(f"DEBUG: Normalization complete")
    print(f"DEBUG: Aria norm range: {aria_norm.min():.3f} - {aria_norm.max():.3f}")
    print(f"DEBUG: Haptic norm range: {haptic_norm.min():.3f} - {haptic_norm.max():.3f}")

    # Create subplots
    fig = make_subplots(
        rows=3, cols=1,
        subplot_titles=(
            'Before Alignment',
            f'After Alignment (offset = {aligner.optimal_offset:.3f}s)',
            'Similarity Score vs Time Offset'
        ),
        vertical_spacing=0.12,
        row_heights=[0.35, 0.35, 0.30]
    )

    # Plot 1: Before alignment
    print(f"DEBUG: Adding Plot 1 traces")
    print(f"DEBUG: Aria trace - x length: {len(aligner.aria_timestamps)}, y length: {len(aria_inverted)}")
    print(f"DEBUG: Haptic trace - x length: {len(aligner.haptic_timestamps)}, y length: {len(haptic_norm)}")

    # Check data ranges for overlap
    aria_time_min, aria_time_max = aligner.aria_timestamps[0], aligner.aria_timestamps[-1]
    haptic_time_min, haptic_time_max = aligner.haptic_timestamps[0], aligner.haptic_timestamps[-1]
    print(f"DEBUG: Time overlap check: Aria [{aria_time_min:.2f}, {aria_time_max:.2f}], Haptic [{haptic_time_min:.2f}, {haptic_time_max:.2f}]")

    # Convert to lists to ensure compatibility
    aria_x = aligner.aria_timestamps.tolist() if hasattr(aligner.aria_timestamps, 'tolist') else list(aligner.aria_timestamps)
    aria_y = aria_inverted.tolist() if hasattr(aria_inverted, 'tolist') else list(aria_inverted)
    haptic_x = aligner.haptic_timestamps.tolist() if hasattr(aligner.haptic_timestamps, 'tolist') else list(aligner.haptic_timestamps)
    haptic_y = haptic_norm.tolist() if hasattr(haptic_norm, 'tolist') else list(haptic_norm)

    print(f"DEBUG: Converted arrays to lists - aria_x: {len(aria_x)}, aria_y: {len(aria_y)}, haptic_x: {len(haptic_x)}, haptic_y: {len(haptic_y)}")

    fig.add_trace(
        go.Scatter(
            x=aria_x,
            y=aria_y,
            name='Aria (inverted distance)',
            line=dict(color='blue', width=2),
            mode='lines'
        ),
        row=1, col=1
    )
    print(f"DEBUG: Added Aria trace to Plot 1")

    fig.add_trace(
        go.Scatter(
            x=haptic_x,
            y=haptic_y,
            name='Haptic (force)',
            line=dict(color='red', width=2),
            mode='lines'
        ),
        row=1, col=1
    )
    print(f"DEBUG: Plot 1 traces added successfully")

    # Plot 2: After alignment
    haptic_aligned_x = (aligner.haptic_timestamps + aligner.optimal_offset).tolist() if hasattr(aligner.haptic_timestamps, 'tolist') else list(aligner.haptic_timestamps + aligner.optimal_offset)

    fig.add_trace(
        go.Scatter(
            x=aria_x,
            y=aria_y,
            name='Aria (inverted distance)',
            line=dict(color='blue', width=2),
            mode='lines',
            showlegend=False
        ),
        row=2, col=1
    )
    print(f"DEBUG: Added Aria trace to Plot 2")

    fig.add_trace(
        go.Scatter(
            x=haptic_aligned_x,
            y=haptic_y,
            name=f'Haptic (offset +{aligner.optimal_offset:.3f}s)',
            line=dict(color='red', width=2),
            mode='lines',
            showlegend=False
        ),
        row=2, col=1
    )
    print(f"DEBUG: Added Haptic trace to Plot 2 (aligned)")

    # Add segment split lines
    if segments:
        for i, (split_time, idx) in enumerate(segments):
            fig.add_vline(
                x=split_time,
                line=dict(color='red', dash='dash', width=1),
                row=2, col=1
            )

    # Plot 3: Correlation curve
    offsets_list = aligner.search_offsets.tolist() if hasattr(aligner.search_offsets, 'tolist') else list(aligner.search_offsets)
    scores_list = aligner.correlation_scores.tolist() if hasattr(aligner.correlation_scores, 'tolist') else list(aligner.correlation_scores)

    print(f"DEBUG: Adding Plot 3 - offsets length: {len(offsets_list)}, scores length: {len(scores_list)}")

    fig.add_trace(
        go.Scatter(
            x=offsets_list,
            y=scores_list,
            name='Similarity score',
            line=dict(color='green', width=2),
            mode='lines',
            showlegend=False
        ),
        row=3, col=1
    )
    print(f"DEBUG: Added correlation curve to Plot 3")
    fig.add_vline(
        x=aligner.optimal_offset,
        line=dict(color='red', dash='dash'),
        row=3, col=1
    )

    # Update axes labels and ranges
    # For Plot 1 (Before Alignment), set x-axis range to encompass both signals
    x_min_plot1 = min(aligner.aria_timestamps[0], aligner.haptic_timestamps[0])
    x_max_plot1 = max(aligner.aria_timestamps[-1], aligner.haptic_timestamps[-1])

    print(f"DEBUG: Plot 1 x-axis range: [{x_min_plot1:.2f}, {x_max_plot1:.2f}]")

    # For Plot 2 (After Alignment), set x-axis range to encompass both aligned signals
    haptic_aligned_min = aligner.haptic_timestamps[0] + aligner.optimal_offset
    haptic_aligned_max = aligner.haptic_timestamps[-1] + aligner.optimal_offset
    x_min_plot2 = min(aligner.aria_timestamps[0], haptic_aligned_min)
    x_max_plot2 = max(aligner.aria_timestamps[-1], haptic_aligned_max)

    print(f"DEBUG: Plot 2 x-axis range: [{x_min_plot2:.2f}, {x_max_plot2:.2f}]")

    fig.update_xaxes(title_text="Time (s)", row=1, col=1, range=[x_min_plot1, x_max_plot1])
    fig.update_xaxes(title_text="Time (s)", row=2, col=1, range=[x_min_plot2, x_max_plot2])
    fig.update_xaxes(title_text="Time Offset (s)", row=3, col=1)

    fig.update_yaxes(title_text="Normalized Value", row=1, col=1, range=[-0.05, 1.05])
    fig.update_yaxes(title_text="Normalized Value", row=2, col=1, range=[-0.05, 1.05])
    fig.update_yaxes(title_text="Similarity Score", row=3, col=1)

    # Update layout
    fig.update_layout(
        height=1000,
        showlegend=True,
        template='plotly_white',
        hovermode='x unified',
        autosize=True,
        margin=dict(l=50, r=50, t=80, b=50)
    )

    print(f"DEBUG: Final figure creation complete")
    print(f"DEBUG: Number of traces: {len(fig.data)}")
    for i, trace in enumerate(fig.data):
        if len(trace.x) > 0 and len(trace.y) > 0:
            print(f"DEBUG: Trace {i} - {trace.name}: x length={len(trace.x)}, x=[{trace.x[0]:.2f}, {trace.x[-1]:.2f}], y length={len(trace.y)}, y=[{trace.y[0]:.3f}, {trace.y[-1]:.3f}]")
        else:
            print(f"WARNING: Trace {i} - {trace.name}: EMPTY DATA - x length={len(trace.x)}, y length={len(trace.y)}")

    fig_json = json.loads(fig.to_json())
    print(f"DEBUG: Figure JSON created successfully")

    return fig_json

