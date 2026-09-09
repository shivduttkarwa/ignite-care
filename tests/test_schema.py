from apps.records.schema import (
    answered_count,
    iter_fields,
    load_schema,
    promoted_values,
    summarise,
    validate,
)

SCHEMA = load_schema("daily_care", "v02")


def test_every_promoted_field_maps_to_a_real_column():
    from apps.records.models import CareRecord

    columns = {f.name for f in CareRecord._meta.get_fields()}
    for _section, field in iter_fields(SCHEMA):
        if field.get("promote"):
            assert field["promote"] in columns, field["key"]


def test_fluids_is_required_every_shift():
    errors = validate(SCHEMA, {"fluids": ""})
    assert errors["fluids"] == "Fluids must be recorded every shift"

    assert "fluids" not in validate(SCHEMA, {"fluids": "1.2L across the shift"})


def test_reason_is_only_required_when_both_washes_are_no():
    both_no = {"shower": False, "bed_bath": False, "fluids": "800ml"}
    assert "no_wash_reason" in validate(SCHEMA, both_no)

    showered = {"shower": True, "bed_bath": False, "fluids": "800ml"}
    assert "no_wash_reason" not in validate(SCHEMA, showered)


def test_hidden_fields_do_not_count_towards_a_section():
    personal_care = SCHEMA["sections"][0]

    showered = {"shower": True, "bed_bath": False, "physio": True}
    assert answered_count(personal_care, showered) == (3, 3)

    both_no = {"shower": False, "bed_bath": False, "physio": True}
    filled, total = answered_count(personal_care, both_no)
    assert total == 4, "the reason question appears once both washes are No"
    assert filled == 3


def test_promoted_values_track_the_answers():
    values = promoted_values(
        SCHEMA,
        {
            "shower": True,
            "bed_bath": False,
            "physio": None,
            "fluids": "800ml",
            "bowel": "",
            "urine": "Normal",
        },
    )
    assert values["shower"] is True
    assert values["bed_bath"] is False
    assert values["physio_completed"] is None
    assert values["fluids_recorded"] is True
    assert values["bowel_recorded"] is False
    assert values["urine_recorded"] is True


def test_summary_reads_like_the_handover_line():
    parts = summarise(SCHEMA, {"shower": True, "bed_bath": False, "bowel": "Soft, normal"})
    assert parts[0] == "Shower: Yes"
    assert "Bowel recorded" in parts
