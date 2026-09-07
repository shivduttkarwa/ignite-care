(function () {
  "use strict";

  const DRAFT_PREFIX = "ignite:draft:";

  function readDraft(key) {
    try {
      const raw = window.localStorage.getItem(DRAFT_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeDraft(key, payload) {
    try {
      window.localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(payload));
      return true;
    } catch (err) {
      return false;
    }
  }

  function clearDraft(key) {
    try {
      window.localStorage.removeItem(DRAFT_PREFIX + key);
    } catch (err) {
      /* storage unavailable, nothing to clear */
    }
  }

  /* Radios hand us "true"/"false" strings; schema rules use real booleans. */
  function normalise(value) {
    if (value === true) return "true";
    if (value === false) return "false";
    return value;
  }

  function isFilled(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return value !== "";
  }

  document.addEventListener("alpine:init", function () {
    /* The daily care record form. Inputs carry real name attributes and the
       form posts normally, so everything here is enhancement only. */
    Alpine.data("recordForm", function (config) {
      return {
        schema: config.schema,
        answers: config.answers || {},
        draftKey: config.draftKey,
        open: config.open || {},
        savedAt: null,
        offerRestore: false,
        pendingDraft: null,

        init() {
          const stored = readDraft(this.draftKey);
          if (stored && stored.savedAt > (config.serverSavedAt || 0)) {
            this.pendingDraft = stored.answers;
            this.offerRestore = true;
          }
          this.$watch("answers", () => this.saveLocal());
        },

        saveLocal() {
          const ok = writeDraft(this.draftKey, {
            answers: this.answers,
            savedAt: Date.now(),
          });
          if (ok) this.savedAt = new Date();
        },

        restoreDraft() {
          Object.assign(this.answers, this.pendingDraft);
          this.offerRestore = false;
        },

        discardDraft() {
          clearDraft(this.draftKey);
          this.offerRestore = false;
        },

        visible(fieldKey) {
          const field = this.field(fieldKey);
          if (!field || !field.show_if) return true;
          return (field.show_if.all || []).every((clause) => {
            const value = this.answers[clause.field];
            if ("eq" in clause) return normalise(value) === normalise(clause.eq);
            if ("filled" in clause) return isFilled(value) === clause.filled;
            return true;
          });
        },

        field(key) {
          for (const section of this.schema.sections) {
            for (const field of section.fields) {
              if (field.key === key) return field;
            }
          }
          return null;
        },

        counts(sectionKey) {
          const section = this.schema.sections.find((s) => s.key === sectionKey);
          if (!section) return { filled: 0, total: 0 };
          let filled = 0;
          let total = 0;
          for (const field of section.fields) {
            if (!this.visible(field.key)) continue;
            total += 1;
            if (isFilled(this.answers[field.key])) filled += 1;
          }
          return { filled, total };
        },

        countLabel(sectionKey) {
          const c = this.counts(sectionKey);
          return c.filled + " of " + c.total + " answered";
        },

        sectionDone(sectionKey) {
          const c = this.counts(sectionKey);
          return c.total > 0 && c.filled === c.total;
        },

        toggle(sectionKey) {
          this.open[sectionKey] = !this.open[sectionKey];
        },

        get savedLabel() {
          if (!this.savedAt) return "";
          const mins = Math.floor((Date.now() - this.savedAt.getTime()) / 60000);
          if (mins < 1) return "Draft saved just now";
          return "Draft saved " + mins + " min ago";
        },

        onSubmit() {
          clearDraft(this.draftKey);
        },
      };
    });

    /* Overnight attendance rows. */
    Alpine.data("repeater", function (config) {
      return {
        rows: config.rows && config.rows.length ? config.rows : [],
        blank: config.blank,

        add() {
          this.rows.push(Object.assign({}, this.blank));
        },

        remove(index) {
          this.rows.splice(index, 1);
        },
      };
    });

    /* Admin table bulk selection. */
    Alpine.data("bulkSelect", function () {
      return {
        selected: [],

        toggle(id) {
          const at = this.selected.indexOf(id);
          if (at === -1) this.selected.push(id);
          else this.selected.splice(at, 1);
        },

        isSelected(id) {
          return this.selected.indexOf(id) !== -1;
        },

        toggleAll(ids, checked) {
          this.selected = checked ? ids.slice() : [];
        },

        clear() {
          this.selected = [];
        },

        get count() {
          return this.selected.length;
        },
      };
    });

    /* A disclosure that remembers nothing. Used for critical notes. */
    Alpine.data("disclosure", function (open) {
      return {
        open: Boolean(open),
        toggle() {
          this.open = !this.open;
        },
      };
    });
  });

  /* Alpine needs to initialise anything htmx swaps in. */
  document.body.addEventListener("htmx:load", function (event) {
    if (window.Alpine && event.detail && event.detail.elt) {
      window.Alpine.initTree(event.detail.elt);
    }
  });
})();
