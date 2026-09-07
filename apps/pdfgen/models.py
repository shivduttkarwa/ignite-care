from django.db import models

from apps.records.models import CareRecord


class RecordDocument(models.Model):
    """The PDF rendered at submission.

    Never regenerated. If the template changes, an old record must still print
    exactly as it was signed.
    """

    record = models.OneToOneField(CareRecord, on_delete=models.CASCADE, related_name="document")
    file = models.FileField(upload_to="records/%Y/%m/")
    sha256 = models.CharField(max_length=64)
    page_count = models.PositiveSmallIntegerField(default=1)
    generated_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"PDF for {self.record.reference}"
