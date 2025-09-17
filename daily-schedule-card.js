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
            // Apply modern card styling with proper HA variables
            card.style.cssText = `
                border-radius: var(--ha-card-border-radius, 16px);
                box-shadow: var(--ha-card-box-shadow, 0 4px 24px rgba(0, 0, 0, 0.08));
                border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
                background: var(--ha-card-background, var(--card-background-color));
                backdrop-filter: blur(20px);
                transition: all 0.3s ease;
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

    // Apply modern styling to content with proper HA variables
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

        // Modern row styling with HA variables
        row.style.cssText = `
            padding: 16px;
            border-radius: var(--ha-card-border-radius, 12px);
            background: var(--card-background-color);
            border: var(--ha-card-border-width, 1px) solid var(--divider-color);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
            row.style.color = "var(--error-color, #ff6b6b)";
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
    // Changed to vertical layout to prevent layout issues with long schedules
    content.style.cssText = `
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 4px;
        border-radius: 8px;
        transition: all 0.2s ease;
    `;

    // Add hover effect
    content.addEventListener('mouseenter', () => {
        content.style.backgroundColor = 'var(--state-icon-hover-color, rgba(0, 0, 0, 0.04))';
        content.style.transform = 'translateY(-1px)';
    });
    content.addEventListener('mouseleave', () => {
        content.style.backgroundColor = 'transparent';
        content.style.transform = 'translateY(0)';
    });

    // Top row with icon and name
    const topRow = document.createElement("DIV");
    topRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
    `;

    const icon = document.createElement("state-badge");
    icon.style.cssText = `
        flex: none;
        transform: scale(1.1);
    `;
    icon.hass = this._hass;
    icon.stateObj = this._hass.states[entity];
    icon.stateColor = true;
    content._icon = icon;
    topRow.appendChild(icon);

    const name_element = document.createElement("P");
    name_element.innerText = name;
    name_element.style.cssText = `
        font-weight: 500;
        font-size: 16px;
        color: var(--primary-text-color);
        margin: 0;
        flex: 1;
    `;
    topRow.appendChild(name_element);

    content.appendChild(topRow);

    // Schedule display below name - FIXED COLORS
    const value_element = document.createElement("P");
    value_element.style.cssText = `
        margin: 0 0 0 calc(40px + 16px);
        font-size: 14px;
        color: var(--primary-text-color);
        font-weight: 500;
        padding: 8px 12px;
        background: var(--state-active-color, rgba(var(--rgb-primary-color), 0.08));
        border-radius: 12px;
        border: 1px solid var(--divider-color);
        display: inline-block;
        max-width: fit-content;
    `;
    content._value_element = value_element;
    content.appendChild(value_element);

    content.onclick = () => {
        this._dialog._entity = entity;
        this._dialog._title.innerText = name;
        this._dialog._message.innerText = "";
        this._dialog._message.style.display = "none"; // Hide initially
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

    // Responsive dialog styling
    this._dialog.style.cssText = `
        --mdc-dialog-min-width: min(500px, 90vw);
        --mdc-dialog-max-width: min(600px, 95vw);
        --mdc-dialog-max-height: 90vh;
        --dialog-backdrop-filter: blur(10px);
        --dialog-background-color: var(--card-background-color);
        --mdc-theme-surface: var(--card-background-color);
    `;

    // Add media query styles directly to the dialog
    const style = document.createElement("style");
    style.textContent = `
        @media (max-width: 768px) {
            ha-dialog {
                --mdc-dialog-min-width: 95vw !important;
                --mdc-dialog-max-width: 95vw !important;
                --mdc-dialog-max-height: 85vh !important;
            }
        }
        @media (max-width: 480px) {
            ha-dialog {
                --mdc-dialog-min-width: 98vw !important;
                --mdc-dialog-max-width: 98vw !important;
                --mdc-dialog-max-height: 90vh !important;
            }
        }
    `;
    document.head.appendChild(style);

    // FIXED: Yellow button with black text permanently
    const plus = document.createElement("DIV");
    plus.style.cssText = `
        color: #000000;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px;
        background: #ffeb3b;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 2px solid #fbc02d;
        margin: 16px 0;
        box-shadow: 0 2px 8px rgba(255, 235, 59, 0.3);
    `;

    const button = document.createElement("mwc-icon-button");
    button.style.cssText = `
        --mdc-icon-button-size: 40px;
        --mdc-icon-size: 24px;
        color: #000000;
    `;
    plus._button = button;
    plus.appendChild(button);

    const icon = document.createElement("ha-icon");
    icon.icon = "mdi:plus";
    icon.style.cssText = `
        color: #000000;
        --mdc-icon-size: 24px;
    `;
    button.appendChild(icon);

    const text = document.createElement("P");
    text.innerText = "הוסף טווח זמן";
    text.style.cssText = `
        margin: 0;
        font-weight: 600;
        font-size: 16px;
        color: #000000;
    `;
    plus.appendChild(text);

    // Hover effect for yellow button
    plus.addEventListener('mouseenter', () => {
        plus.style.background = '#fdd835';
        plus.style.transform = 'translateY(-2px)';
        plus.style.boxShadow = '0 4px 16px rgba(255, 235, 59, 0.4)';
    });
    plus.addEventListener('mouseleave', () => {
        plus.style.background = '#ffeb3b';
        plus.style.transform = 'translateY(0)';
        plus.style.boxShadow = '0 2px 8px rgba(255, 235, 59, 0.3)';
    });

    plus.onclick = () => {
        if (button.disabled === true) {
            return;
        }

        this._dialog._schedule.push({ from: null, to: null });
        this._createDialogRows();
        this._saveBackendEntity();
    };

    this._dialog._plus = plus;

    // FIXED: Hide error message initially
    const message = document.createElement("P");
    message.style.cssText = `
        display: none;
        color: var(--error-color, #ff6b6b);
        margin: 16px 0;
        padding: 12px;
        background: var(--error-state-color, rgba(255, 107, 107, 0.1));
        border-radius: 8px;
        border: 1px solid var(--error-color, rgba(255, 107, 107, 0.2));
        font-weight: 500;
    `;
    message.innerText = "";
    this._dialog._message = message;
}

_createDialogRows() {
    this._dialog.innerHTML = "";

    // Create container for better spacing - FIXED BOTTOM PADDING
    const container = document.createElement("DIV");
    container.style.cssText = `
        padding: clamp(16px, 4vw, 24px);
        padding-bottom: clamp(32px, 6vw, 40px);
        gap: clamp(16px, 3vw, 20px);
        display: flex;
        flex-direction: column;
        max-height: 70vh;
        overflow-y: auto;
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
        padding: clamp(16px, 4vw, 24px) clamp(16px, 4vw, 24px) 0 clamp(16px, 4vw, 24px);
    `;

    const close = document.createElement("ha-icon");
    close.icon = "mdi:close";
    close.style.cssText = `
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s ease;
        --mdc-icon-size: 24px;
        color: var(--primary-text-color);
    `;
    close.addEventListener('mouseenter', () => {
        close.style.backgroundColor = 'var(--state-icon-hover-color, rgba(0, 0, 0, 0.1))';
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
        font-size: clamp(18px, 4vw, 20px);
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
        transition: all 0.2s ease;
        --mdc-icon-size: 24px;
        color: var(--primary-text-color);
    `;
    more_info.addEventListener('mouseenter', () => {
        more_info.style.backgroundColor = 'var(--state-icon-hover-color, rgba(0, 0, 0, 0.1))';
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
        flex-wrap: wrap;
        gap: clamp(12px, 3vw, 16px);
        align-items: center;
        padding: clamp(16px, 4vw, 20px);
        margin-block: clamp(6px, 1.2vw, 10px);
        background: var(--card-background-color);
        border-radius: 16px;
        border: 1px solid var(--divider-color);
        transition: all 0.3s ease;
    `;

    // Responsive layout for mobile
    const mobileMediaQuery = window.matchMedia('(max-width: 768px)');
    if (mobileMediaQuery.matches) {
        row.style.flexDirection = 'column';
        row.style.alignItems = 'stretch';
    }

    // Add hover effect to rows
    row.addEventListener('mouseenter', () => {
        row.style.transform = 'translateY(-2px)';
        row.style.boxShadow = '0 8px 24px var(--shadow-elevation-2x_-_box-shadow, rgba(0, 0, 0, 0.1))';
    });
    row.addEventListener('mouseleave', () => {
        row.style.transform = 'translateY(0)';
        row.style.boxShadow = 'none';
    });

    // Time inputs container for mobile layout - FIXED WITH FLEX-WRAP
    const timeContainer = document.createElement("DIV");
    timeContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: clamp(8px, 2vw, 16px);
        flex: 1;
        min-width: 0;
    `;

    // Start time with icon
    this._createTimeInput(range, "from", timeContainer, "start");

    // End time with icon (removed arrow)
    this._createTimeInput(range, "to", timeContainer, "end");

    row.appendChild(timeContainer);

    // Controls container
    const controlsContainer = document.createElement("DIV");
    controlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: clamp(8px, 2vw, 16px);
        flex: none;
    `;

    const toggle = document.createElement("ha-switch");
    toggle.style.cssText = `
        --mdc-switch-selected-track-color: var(--primary-color);
        --mdc-switch-selected-handle-color: var(--primary-color);
    `;
    toggle.checked = !range.disabled;
    toggle.addEventListener("change", () => {
        range.disabled = !range.disabled;
        this._saveBackendEntity();
    });
    controlsContainer.appendChild(toggle);

    const remove = document.createElement("ha-icon");
    remove.icon = "mdi:delete-outline";
    remove.style.cssText = `
        cursor: pointer;
        color: var(--error-color, #ff6b6b);
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s ease;
        --mdc-icon-size: 20px;
    `;
    remove.addEventListener('mouseenter', () => {
        remove.style.backgroundColor = 'var(--error-state-color, rgba(255, 107, 107, 0.1))';
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
    controlsContainer.appendChild(remove);

    row.appendChild(controlsContainer);

    return row;
}

// FIXED: Added icons for start/end times, removed arrow
_createTimeInput(range, type, container, iconType) {
    // Create input container with icon
    const inputContainer = document.createElement("DIV");
    inputContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: clamp(140px, 28vw, 180px);
        max-width: 200px;
    `;

    // Add icon based on type
    const icon = document.createElement("ha-icon");
    if (iconType === "start") {
        icon.icon = "mdi:play-circle-outline";
    } else {
        icon.icon = "mdi:stop-circle-outline";
    }
    icon.style.cssText = `
        color: var(--primary-color);
        --mdc-icon-size: 20px;
        flex: none;
    `;
    inputContainer.appendChild(icon);

    const time_input = document.createElement("INPUT");
    time_input.type = "time";

    // Improved styling for time inputs with responsive design
    time_input.style.cssText = `
        padding: clamp(8px, 2vw, 12px) clamp(12px, 3vw, 16px);
        border: 2px solid var(--input-outlined-idle-border-color, var(--divider-color));
        border-radius: 12px;
        background: var(--input-fill-color, var(--card-background-color));
        font-size: clamp(14px, 3.5vw, 16px);
        font-weight: 500;
        color: var(--primary-text-color);
        transition: all 0.2s ease;
        cursor: pointer;
        flex: 1;
        min-width: 0;
    `;

    // Set initial value if exists
    if (range[type]) {
        const time = range[type].split(":");
        time_input.value = time[0] + ":" + time[1];
    }

    // Add focus effects with proper HA variables
    time_input.addEventListener('focus', () => {
        time_input.style.borderColor = 'var(--input-outlined-hover-border-color, var(--primary-color))';
        time_input.style.boxShadow = '0 0 0 3px var(--state-focus-color, rgba(var(--rgb-primary-color), 0.1))';
    });
    time_input.addEventListener('blur', () => {
        time_input.style.borderColor = 'var(--input-outlined-idle-border-color, var(--divider-color))';
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

    inputContainer.appendChild(time_input);
    container.appendChild(inputContainer);
}

_getInputTimeWidth() {
    // Fixed width for consistent layout - will be handled by CSS
    this._input_time_width = 140;
}

_saveBackendEntity() {
    this._dialog._plus._button.disabled = true;

    for (const range of this._dialog._schedule) {
        if (range.from === null || range.to === null) {
            if (this._dialog._message.innerText !== "שדות חסרים.") {
                this._dialog._message.innerText = "שדות חסרים.";
                this._dialog._message.style.display = "flex"; // Show error
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
                this._dialog._message.style.display = "none"; // Hide error
            }
            this._dialog._plus._button.disabled = false;
        })
        .catch((error) => {
            if (this._dialog._message.innerText !== error.message) {
                this._dialog._message.innerText = error.message;
                this._dialog._message.style.display = "flex"; // Show error
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
                    background: var(--card-background-color);
                    border-radius: var(--ha-card-border-radius, 12px);
                    border: var(--ha-card-border-width, 1px) solid var(--divider-color);
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
                    background: var(--card-background-color);
                    border-radius: var(--ha-card-border-radius, 12px);
                    border: var(--ha-card-border-width, 1px) solid var(--divider-color);
                    transition: all 0.2s ease;
                }

                .entity:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--ha-card-box-shadow, 0 8px 24px rgba(0, 0, 0, 0.1));
                }

                .handle {
                    cursor: grab;
                    padding: 8px;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                    color: var(--secondary-text-color);
                }

                .handle:hover {
                    background: var(--state-icon-hover-color, rgba(0, 0, 0, 0.05));
                }

                .add-entity {
                    margin-top: 16px;
                    padding: 16px;
                    border: 2px dashed var(--primary-color, rgba(var(--rgb-primary-color), 0.3));
                    border-radius: var(--ha-card-border-radius, 12px);
                    background: var(--state-active-color, rgba(var(--rgb-primary-color), 0.05));
                    transition: all 0.2s ease;
                }

                .add-entity:hover {
                    background: var(--state-hover-background-color, rgba(var(--rgb-primary-color), 0.1));
                    border-color: var(--primary-color, rgba(var(--rgb-primary-color), 0.5));
                }

                h3 {
                    font-size: 18px;
                    font-weight: 600;
                    color: var(--primary-text-color);
                    margin: 24px 0 16px 0;
                }

                ha-textfield {
                    width: 100%;
                    --mdc-text-field-fill-color: var(--input-fill-color, var(--card-background-color));
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
            "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
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
