"""Template tags used by the printed record templates."""

from django import template
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from apps.records.attachments import clock_text

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
def clock(value):
    return clock_text(value)
