import pytest

from app.pae import PaeParseError, analyze_pae_json


def test_analyze_pae_json_summarizes_alphafold_record_shape():
    content = b"""
    [
      {
        "max_predicted_aligned_error": 31.75,
        "predicted_aligned_error": [
          [0.0, 4.5, 16.0],
          [4.2, 0.0, 12.0],
          [17.0, 12.5, 0.0]
        ]
      }
    ]
    """

    summary, warnings = analyze_pae_json(content)

    assert summary.residue_count == 3
    assert summary.max_predicted_aligned_error == 31.75
    assert summary.mean_predicted_aligned_error == 7.36
    assert summary.high_error_pair_count == 2
    assert summary.high_error_threshold == 15.0
    assert warnings


def test_analyze_pae_json_accepts_direct_matrix_shape():
    summary, warnings = analyze_pae_json('{"pae": [[0, 2], [3, 0]], "max_pae": 20}')

    assert summary.residue_count == 2
    assert summary.max_predicted_aligned_error == 20.0
    assert summary.mean_predicted_aligned_error == 1.25
    assert summary.high_error_pair_count == 0
    assert warnings == []


@pytest.mark.parametrize(
    "content, message",
    [
        (b"", "empty"),
        (b"not-json", "valid JSON"),
        (b'{"predicted_aligned_error": [[0, 1, 2], [1, 0]]}', "square"),
        (b'{"predicted_aligned_error": [[0, -1], [1, 0]]}', "negative"),
        (b'{"predicted_aligned_error": [[0, "bad"], [1, 0]]}', "numeric"),
    ],
)
def test_analyze_pae_json_rejects_invalid_content(content, message):
    with pytest.raises(PaeParseError, match=message):
        analyze_pae_json(content)
