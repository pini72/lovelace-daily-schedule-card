class DailyScheduleCard extends HTMLElement {

set hass(hass) {
    this._hass = hass;

    if (!this._config) {
        return;
    }

    if (!this._dialog) {
        this._getInputTimeWidth();
        this._createDialog();
        this.appendChild(this._dialog);
    }

    if (!this._content) {
        this._content = this._createContent();
        if (this._config.title || this._config.card) {
            const card = document.createElement("ha-card");
            card.header = this._config.title;
            this._content.classList.add("card-content");
            card.appendChild(this._content);
            // Apply modern card styling
            card.style.cssText = `
                border-radius: 16px;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.1);
                background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9));
                backdrop-filter: blur(20px);
            `;
            this.appendChild(card);
        } else {
            this.appendChild(this._content);
        }
    } else {
        this._updateContent();
    }
}

setConfig(config) {
    if (
        this._config !== null &&
        JSON.stringify(this._config) === JSON.stringify(config)
    ) {
        this._config = config;
        return;
    }

    if (!config.entities) {
        throw new Error("You need to define entities");
    }

    this._config = config;
    this.innerHTML = "";
    this._content = null;
}

getCardSize() {
    return this._config !== null ? this._config.entities.length : 1;
}

static getConfigElement() {
    return document.createElement("daily-schedule-card-editor");
}

static getStubConfig() {
    return { card: true, entities: [] };
}

_createContent() {
    const content = document.createElement("DIV");
    content._rows = [];

    // Apply modern styling to content
    content.style.cssText = `
        padding: 16px;
        gap: 12px;
        display: flex;
        flex-direction: column;
    `;

    for (const entry of this._config.entities) {
        const entity = entry.entity || entry;
        const row = document.createElement("DIV");
        row._entity = entity;
        row._template_value = entry.template || this._config.template;
        row.classList.add("card-content");

        // Modern row styling
        row.style.cssText = `
            padding: 16px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.7);
            border: 1px solid rgba(0, 0, 0, 0.06);
            backdrop-filter: blur(10px);
        `;

        if (this._hass.states[entity]) {
            const content = this._createCardRow(
                entity,
                entry.name ||
                    this._hass.states[entity].attributes.friendly_name ||
                    entity
            );
            row._content = content;
            this._setCardRowValue(row);
            row.appendChild(content);
        } else {
            row.innerText = "Entity not found: " + entry.entity;
            row.style.color = "#ff6b6b";
        }

        content._rows.push(row);
        content.appendChild(row);
    }

    return content;
}

_updateContent() {
    for (const row of this._content._rows) {
        row._content._icon.hass = this._hass;
        row._content._icon.stateObj = this._hass.states[row._entity];
        this._setCardRowValue(row);
    }
}

_createCardRow(entity, name) {
    const content = document.createElement("DIV");
    content.style.cssText = `
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 4px;
        border-radius: 8px;
    `;

    // Add hover effect
    content.addEventListener('mouseenter', () => {
        content.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
    });
    content.addEventListener('mouseleave', () => {
        content.style.backgroundColor = 'transparent';
    });

    const icon = document.createElement("state-badge");
    icon.style.cssText = `
        flex: none;
        transform: scale(1.1);
    `;
    icon.hass = this._hass;
    icon.stateObj = this._hass.states[entity];
    icon.stateColor = true;
    content._icon = icon;
    content.appendChild(icon);

    const name_element = document.createElement("P");
    name_element.innerText = name;
    name_element.style.cssText = `
        font-weight: 500;
        font-size: 16px;
        color: var(--primary-text-color);
        margin: 0;
        flex: 1;
    `;
    content.appendChild(name_element);

    const value_element = document.createElement("P");
    value_element.style.cssText = `
        margin: 0;
        font-size: 14px;
        color: var(--secondary-text-color);
        font-weight: 400;
        padding: 8px 12px;
        background: rgba(var(--rgb-primary-color), 0.1);
        border-radius: 20px;
        border: 1px solid rgba(var(--rgb-primary-color), 0.2);
    `;
    content._value_element = value_element;
    content.appendChild(value_element);

    content.onclick = () => {
        this._dialog._entity = entity;
        this._dialog._title.innerText = name;
        this._dialog._message.innerText = "";
        this._dialog._plus._button.disabled = false;
        this._dialog._schedule = [...this._getStateSchedule(entity)];
        this._createDialogRows();
        this._dialog.show();
    };

    return content;
}

_getStateSchedule(entity, effective = false) {
    const state = this._hass.states[entity];
    return !state
        ? []
        : !effective
        ? state.attributes.schedule || []
        : state.attributes.effective_schedule || [];
}

_rowEntityChanged(row) {
    const entity_data = this._hass.states[row._entity]
        ? JSON.stringify(
              (({ state, attributes }) => ({ state, attributes }))(
                  this._hass.states[row._entity]
              )
          )
        : null;
    const changed = row._entity_data !== entity_data;
    row._entity_data = entity_data;
    return changed;
}

_rowTemplateValue(row) {
    const subscribed = this._hass.connection.subscribeMessage(
        (message) => {
            row._content._value_element.innerHTML = message.result.length
                ? `${message.result}`
                : "∅";
        },
        {
            type: "render_template",
            template: row._template_value,
            variables: { entity_id: row._entity },
        }
    );
}

_setCardRowValue(row) {
    if (!this._rowEntityChanged(row)) {
        return;
    }

    if (!row._template_value) {
        let value = this._getStateSchedule(row._entity, true)
            .filter((range) => !range.disabled)
            .map((range) => range.from.slice(0, -3) + "-" + range.to.slice(0, -3))
            .join(", ");
        if (!value.length) {
            row._content._value_element.innerHTML = "∅";
        } else {
            row._content._value_element.innerHTML = `${value}`;
        }
    } else {
        this._rowTemplateValue(row);
    }
}

_createDialog() {
    this._dialog = document.createElement("ha-dialog");
    this._dialog.heading = this._createDialogHeader();
    this._dialog.open = false;

    // Modern dialog styling with larger size
    this._dialog.style.cssText = `
        --mdc-dialog-min-width: 500px;
        --mdc-dialog-max-width: 80vw;
        --mdc-dialog-max-height: 80vh;
    `;

    const plus = document.createElement("DIV");
    plus.style.cssText = `
        color: var(--primary-color);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px;
        background: rgba(var(--rgb-primary-color), 0.1);
        border-radius: 12px;
        cursor: pointer;
        border: 2px dashed rgba(var(--rgb-primary-color), 0.3);
        margin: 16px 0;
    `;

    const button = document.createElement("mwc-icon-button");
    button.style.cssText = `
        --mdc-icon-button-size: 40px;
        --mdc-icon-size: 24px;
        color: var(--primary-color);
    `;
    plus._button = button;
    plus.appendChild(button);

    const icon = document.createElement("ha-icon");
    icon.icon = "mdi:plus";
    button.appendChild(icon);

    const text = document.createElement("P");
    text.innerText = "הוסף טווח זמן";
    text.style.cssText = `
        margin: 0;
        font-weight: 500;
        font-size: 16px;
        color: var(--primary-color);
    `;
    plus.appendChild(text);

    plus.onclick = () => {
        if (button.disabled === true) {
            return;
        }

        this._dialog._schedule.push({ from: null, to: null });
        this._createDialogRows();
        this._saveBackendEntity();
    };

    this._dialog._plus = plus;

    const message = document.createElement("P");
    message.style.cssText = `
        display: flex;
        color: #ff6b6b;
        margin: 16px 0;
        padding: 12px;
        background: rgba(255, 107, 107, 0.1);
        border-radius: 8px;
        border: 1px solid rgba(255, 107, 107, 0.2);
        font-weight: 500;
    `;
    message.innerText = "";
    this._dialog._message = message;
}

_createDialogRows() {
    this._dialog.innerHTML = "";

    // Create container for better spacing
    const container = document.createElement("DIV");
    container.style.cssText = `
        padding: 24px;
        gap: 20px;
        display: flex;
        flex-direction: column;
    `;

    this._dialog._schedule.forEach((range, index) => {
        container.appendChild(this._createDialogRow(range, index));
    });

    container.appendChild(this._dialog._plus);
    container.appendChild(this._dialog._message);
    this._dialog.appendChild(container);
}

_createDialogHeader() {
    const header = document.createElement("DIV");
    header.style.cssText = `
        color: var(--primary-text-color);
        display: flex;
        gap: 16px;
        align-items: center;
        padding: 24px 24px 0 24px;
    `;

    const close = document.createElement("ha-icon");
    close.icon = "mdi:close";
    close.style.cssText = `
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        --mdc-icon-size: 24px;
    `;
    close.addEventListener('mouseenter', () => {
        close.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });
    close.addEventListener('mouseleave', () => {
        close.style.backgroundColor = 'transparent';
    });
    close.onclick = () => {
        this._dialog.close();
    };
    header.appendChild(close);

    const title = document.createElement("P");
    title.style.cssText = `
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: var(--primary-text-color);
        flex: 1;
    `;
    header.appendChild(title);
    this._dialog._title = title;

    const more_info = document.createElement("ha-icon");
    more_info.icon = "mdi:information-outline";
    more_info.style.cssText = `
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        --mdc-icon-size: 24px;
    `;
    more_info.addEventListener('mouseenter', () => {
        more_info.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    });
    more_info.addEventListener('mouseleave', () => {
        more_info.style.backgroundColor = 'transparent';
    });
    more_info.onclick = () => {
        this._dialog.close();
        const event = new Event("hass-more-info", {
            bubbles: true,
            cancelable: false,
            composed: true,
        });
        event.detail = { entityId: this._dialog._entity };
        this.dispatchEvent(event);
    };
    header.appendChild(more_info);

    return header;
}

_createDialogRow(range, index) {
    const row = document.createElement("DIV");
    row.style.cssText = `
        color: var(--primary-text-color);
        display: flex;
        gap: 16px;
        align-items: center;
        padding: 20px;
        background: rgba(255, 255, 255, 0.7);
        border-radius: 16px;
        border: 1px solid rgba(0, 0, 0, 0.06);
    `;

    // Remove hover effects
    row.addEventListener('mouseenter', () => {
        row.style.boxShadow = 'none';
    });
    row.addEventListener('mouseleave', () => {
        row.style.boxShadow = 'none';
    });

    // Start time label
    const fromLabel = document.createElement("SPAN");
    fromLabel.innerText = "התחלה";
    fromLabel.style.cssText = `
        font-size: 16px;
        color: var(--secondary-text-color);
        font-weight: 500;
        margin-right: -10px;
    `;
    row.appendChild(fromLabel);
    this._createTimeInput(range, "from", row);

    // "To" label instead of arrow icon
    const toLabel = document.createElement("SPAN");
    toLabel.innerText = "ל-";
    toLabel.style.cssText = `
        font-size: 16px;
        color: var(--secondary-text-color);
        font-weight: 500;
    `;
    row.appendChild(toLabel);

    // End time label
    const toTimeLabel = document.createElement("SPAN");
    toTimeLabel.innerText = "סיום";
    toTimeLabel.style.cssText = `
        font-size: 16px;
        color: var(--secondary-text-color);
        font-weight: 500;
        margin-right: -10px;
    `;
    row.appendChild(toTimeLabel);
    this._createTimeInput(range, "to", row);


    const toggle = document.createElement("ha-switch");
    toggle.style.cssText = `
        margin-left: auto;
        padding-left: 16px;
        --mdc-switch-selected-track-color: var(--primary-color);
        --mdc-switch-selected-handle-color: var(--primary-color);
    `;
    toggle.checked = !range.disabled;
    toggle.addEventListener("change", () => {
        range.disabled = !range.disabled;
        this._saveBackendEntity();
    });
    row.appendChild(toggle);

    const remove = document.createElement("ha-icon");
    remove.icon = "mdi:delete-outline";
    remove.style.cssText = `
        cursor: pointer;
        color: #ff6b6b;
        padding: 8px;
        border-radius: 50%;
        --mdc-icon-size: 20px;
    `;
    remove.addEventListener('mouseenter', () => {
        remove.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
    });
    remove.addEventListener('mouseleave', () => {
        remove.style.backgroundColor = 'transparent';
    });
    remove.onclick = () => {
        this._dialog._schedule = this._dialog._schedule.filter(
            (_, i) => i !== index
        );
        this._createDialogRows();
        this._saveBackendEntity();
    };
    row.appendChild(remove);

    return row;
}

// Simplified time input without sunrise/sunset functionality
_createTimeInput(range, type, row) {
    const time_input = document.createElement("INPUT");
    time_input.type = "time";

    // Improved styling for time inputs
    time_input.style.cssText = `
        padding: 12px 16px;
        border: 2px solid rgba(var(--rgb-primary-color), 0.2);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.9);
        font-size: 16px;
        font-weight: 500;
        color: var(--primary-text-color);
        min-width: 140px;
        cursor: pointer;
    `;

    // Set initial value if exists
    if (range[type]) {
        const time = range[type].split(":");
        time_input.value = time[0] + ":" + time[1];
    }

    // Add focus effects
    time_input.addEventListener('focus', () => {
        time_input.style.borderColor = 'var(--primary-color)';
        time_input.style.boxShadow = '0 0 0 3px rgba(var(--rgb-primary-color), 0.1)';
    });
    time_input.addEventListener('blur', () => {
        time_input.style.borderColor = 'rgba(var(--rgb-primary-color), 0.2)';
        time_input.style.boxShadow = 'none';
    });

    time_input.onchange = () => {
        if (!time_input.value) {
            range[type] = null;
            this._saveBackendEntity();
            return;
        }

        const value = time_input.value + ":00";

        if (range[type] !== value) {
            range[type] = value;
            this._saveBackendEntity();
        }
    };

    row.appendChild(time_input);
}

_getInputTimeWidth() {
    // Fixed width for consistent layout
    this._input_time_width = 140;
}

_saveBackendEntity() {
    this._dialog._plus._button.disabled = true;

    for (const range of this._dialog._schedule) {
        if (range.from === null || range.to === null) {
            if (this._dialog._message.innerText !== "Missing field(s).") {
                this._dialog._message.innerText = "שדות חסרים.";
            }
            return;
        }
    }

    this._hass
        .callService("daily_schedule", "set", {
            entity_id: this._dialog._entity,
            schedule: this._dialog._schedule,
        })
        .then(() => {
            if (this._dialog._message.innerText.length > 0) {
                this._dialog._message.innerText = "";
            }
            this._dialog._plus._button.disabled = false;
        })
        .catch((error) => {
            if (this._dialog._message.innerText !== error.message) {
                this._dialog._message.innerText = error.message;
            }
            return Promise.reject(error);
        });
}
}

customElements.define("daily-schedule-card", DailyScheduleCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "daily-schedule-card",
    name: "Daily Schedule",
    description: "Card for displaying and editing Daily Schedule entities.",
    documentationURL: "https://github.com/pini72/lovelace-daily-schedule-card",
});


// Editor Component for Daily Schedule Card
class DailyScheduleCardEditor extends HTMLElement {
    constructor() {
        super();
        // Workaround for forcing the load of "ha-entity-picker" element.
        this._hui_entities_card_editor = document
            .createElement("hui-entities-card")
            .constructor.getConfigElement();
        this._shadow = this.attachShadow({ mode: "open" });
    }

    set hass(hass) {
        this._hass = hass;
    }

    setConfig(config) {
        if (
            JSON.stringify(this._config) === JSON.stringify(config) ||
            !this._hass
        ) {
            return;
        }

        this._config = JSON.parse(JSON.stringify(config));
        this._setCSS();
        this._addTitle();
        this._addEntities();
    }

    _setCSS() {
        this._shadow.innerHTML = `
            <style>
                .card-config {
                    padding: 16px;
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 12px;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    margin-bottom: 16px;
                    backdrop-filter: blur(10px);
                }

                .entities {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .entity {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(255, 255, 255, 0.7);
                    border-radius: 12px;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    transition: none;
                }

                .entity:hover {
                    transform: none;
                    box-shadow: none;
                }

                .handle {
                    cursor: grab;
                    padding: 8px;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                }

                .handle:hover {
                    background: rgba(0, 0, 0, 0.05);
                }

                .add-entity {
                    margin-top: 16px;
                    padding: 16px;
                    border: 2px dashed rgba(var(--rgb-primary-color), 0.3);
                    border-radius: 12px;
                    background: rgba(var(--rgb-primary-color), 0.05);
                    transition: all 0.2s ease;
                }

                .add-entity:hover {
                    background: rgba(var(--rgb-primary-color), 0.1);
                    border-color: rgba(var(--rgb-primary-color), 0.5);
                }

                h3 {
                    font-size: 18px;
                    font-weight: 600;
                    color: var(--primary-text-color);
                    margin: 24px 0 16px 0;
                }

                ha-textfield {
                    width: 100%;
                    --mdc-text-field-fill-color: rgba(255, 255, 255, 0.9);
                    --mdc-shape-small: 12px;
                }
            </style>
        `;
    }

    _addTitle() {
        const title = document.createElement("ha-textfield");
        title.label = `${this._hass.localize(
            "ui.panel.lovelace.editor.card.generic.title"
        )} (${this._hass.localize(
            "ui.panel.lovelace.editor.card.config.optional"
        )})`;
        if (this._config.title) {
            title.value = this._config.title;
        }

        title.addEventListener("input", (ev) => {
            const value = ev.target.value;
            if (value) {
                this._config.title = value;
            } else {
                delete this._config.title;
            }
            this._configChanged();
        });

        const card = document.createElement("DIV");
        card.classList.add("card-config");
        card.appendChild(title);
        this._shadow.appendChild(card);
    }

    _addEntities() {
        const title = document.createElement("h3");
        title.textContent = `${this._hass.localize(
            "ui.panel.lovelace.editor.card.generic.entities"
        )} (${this._hass.localize(
            "ui.panel.lovelace.editor.card.config.required"
        )})`;
        this._shadow.appendChild(title);

        const sortable = document.createElement("ha-sortable");
        sortable.handleSelector = ".handle";
        sortable.addEventListener("item-moved", (ev) => {
            const { oldIndex, newIndex } = ev.detail;
            this._config.entities.splice(
                newIndex,
                0,
                this._config.entities.splice(oldIndex, 1)[0]
            );
            this._configChanged(true);
        });

        const entities = document.createElement("DIV");
        entities.classList.add("entities");
        this._config.entities.forEach((config, index) =>
            this._addEntity(config, index, entities)
        );

        sortable.appendChild(entities);
        this._shadow.appendChild(sortable);
        this._addNewEntity();
    }

    _createEntityPicker() {
        const picker = document.createElement("ha-entity-picker");
        picker.hass = this._hass;
        picker.includeDomains = ["binary_sensor"];
        picker.entityFilter = (entity) =>
            this._hass.entities?.[entity.entity_id]?.platform === "daily_schedule";
        return picker;
    }

    _addEntity(config, index, parent) {
        const entity = document.createElement("DIV");
        entity.classList.add("entity");

        const handle = document.createElement("DIV");
        handle.classList.add("handle");
        entity.appendChild(handle);

        const drag = document.createElement("ha-svg-icon");
        drag.path =
            "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H13V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
        handle.appendChild(drag);

        const picker = this._createEntityPicker();
        picker.value = config.entity || config;
        picker.index = index;
        picker.addEventListener("value-changed", (ev) => {
            const value = ev.detail.value;
            if (value) {
                this._config.entities[index] = value;
                this._configChanged();
            } else {
                this._config.entities.splice(index, 1);
                this._configChanged(true);
            }
        });

        entity.appendChild(picker);
        parent.appendChild(entity);
    }

    _addNewEntity() {
        const entity = this._createEntityPicker();
        entity.classList.add("add-entity");
        entity.addEventListener("value-changed", (ev) => {
            this._config.entities.push(ev.detail.value);
            this._configChanged(true);
        });

        this._shadow.appendChild(entity);
    }

    _configChanged(rerender = false) {
        const event = new Event("config-changed", {
            bubbles: true,
            composed: true,
        });
        event.detail = {
            config: JSON.parse(JSON.stringify(this._config)),
        };
        if (rerender) {
            this._config = null;
        }
        this.dispatchEvent(event);
    }
}

customElements.define("daily-schedule-card-editor", DailyScheduleCardEditor);
