from django import template
from django.utils import timezone
from django.utils.html import format_html
from django.utils.safestring import mark_safe

register = template.Library()

NOT_RECORDED = mark_safe('<span class="not-recorded">Not recorded</span>')


@register.simple_tag
def answer(record, key):
    """A stored answer, or the paper form's own 'Not recorded'."""
    value = (record.answers or {}).get(key)
    if value is None or value == "":
        return NOT_RECORDED
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return value


@register.simple_tag
def yesno_boxes(record, key):
    """Renders YES / NO with a box drawn around the answer, as on the paper form."""
    value = (record.answers or {}).get(key)
    if value is True:
        return mark_safe('<span class="box">YES</span> <span class="off">NO</span>')
    if value is False:
        return mark_safe('<span class="off">YES</span> <span class="box">NO</span>')
    return format_html('<span class="off">YES</span> <span class="off">NO</span> {}', NOT_RECORDED)


@register.filter
def get(mapping, key):
    if hasattr(mapping, "get"):
        return mapping.get(key)
    return None


@register.filter
def shift_short(value):
    return {"morning": "Morning", "afternoon": "Afternoon", "night": "Night"}.get(value, value)


@register.filter
def clock(value):
    """6:02am in the service's timezone, not the locale's '6:02 a.m.'"""
    if not value:
        return ""
    if hasattr(value, "tzinfo") and value.tzinfo is not None:
        value = timezone.localtime(value)
    hour = value.hour % 12 or 12
    suffix = "am" if value.hour < 12 else "pm"
    return f"{hour}:{value.minute:02d}{suffix}"


@register.simple_tag
def field_label(field, participant):
    """Fills {participant} in a schema label with the name the staff use."""
    label = field.get("label", "")
    name = participant.preferred_name or participant.first_name
    return label.replace("{participant}", name)
