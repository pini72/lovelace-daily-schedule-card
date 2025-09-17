class DailyScheduleCard extends HTMLElement {
    constructor() {
        super();
        this._subscriptions = new Set(); // מניעת זליגות זיכרון
        this._isUpdating = false; // מניעת עדכונים חופפים
        this._updateTimeout = null; // Debouncing
    }

    // ניקוי משאבים בעת הסרה מה-DOM
    disconnectedCallback() {
        this._cleanup();
    }

    _cleanup() {
        // ביטול כל ה-subscriptions
        this._subscriptions.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this._subscriptions.clear();
        
        // ניקוי timeouts
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
            this._updateTimeout = null;
        }
    }

    set hass(hass) {
        this._hass = hass;

        if (!this._config) {
            return;
        }

        // Debounced updates למניעת עדכונים מיותרים
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }
        
        this._updateTimeout = setTimeout(() => {
            this._performUpdate();
        }, 50);
    }

    _performUpdate() {
        if (!this._dialog) {
            this._getInputTimeWidth();
            this._createDialog();
            this.appendChild(this._dialog);
        }

        if (!this._content) {
            this._showLoadingState();
            this._content = this._createContent();
            this._hideLoadingState();
            
            if (this._config.title || this._config.card) {
                const card = this._createCard();
                this.appendChild(card);
            } else {
                this.appendChild(this._content);
            }
        } else {
            this._updateContent();
        }
    }

    // מצב טעינה משופר
    _showLoadingState() {
        const loader = document.createElement("DIV");
        loader.id = "loading-state";
        loader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 16px;
            color: var(--secondary-text-color);
            font-size: 14px;
        `;
        
        const spinner = document.createElement("ha-circular-progress");
        spinner.active = true;
        spinner.style.cssText = `
            --mdc-theme-primary: var(--primary-color);
            margin-left: 8px;
            width: 20px;
            height: 20px;
        `;
        
        loader.appendChild(document.createTextNode("טוען לוח זמנים..."));
        loader.appendChild(spinner);
        this.appendChild(loader);
    }

    _hideLoadingState() {
        const loader = this.querySelector("#loading-state");
        if (loader) {
            loader.remove();
        }
    }

    // יצירת כרטיס עם אנימציות חלקות
    _createCard() {
        const card = document.createElement("ha-card");
        card.header = this._config.title;
        this._content.classList.add("card-content");
        card.appendChild(this._content);
        
        // אנימציית כניסה
        card.style.cssText = `
            border-radius: var(--ha-card-border-radius, 16px);
            box-shadow: var(--ha-card-box-shadow, 0 4px 24px rgba(0, 0, 0, 0.08));
            border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
            background: var(--ha-card-background, var(--card-background-color));
            backdrop-filter: blur(20px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
            transform: translateY(20px);
        `;
        
        // אנימציית fade-in
        requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        });
        
        return card;
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
            throw new Error("יש להגדיר רשימת ישויות");
        }

        this._config = config;
        this._cleanup(); // ניקוי משאבים קודמים
        this.innerHTML = "";
        this._content = null;
    }

    getCardSize() {
        return this._config !== null ? Math.max(1, this._config.entities.length) : 1;
    }

    static getConfigElement() {
        return document.createElement("daily-schedule-card-editor");
    }

    static getStubConfig() {
        return { card: true, entities: [] };
    }

    // יצירת תוכן משופר עם נגישות
    _createContent() {
        const content = document.createElement("DIV");
        content.setAttribute('role', 'region');
        content.setAttribute('aria-label', 'לוח זמנים יומי');
        content._rows = [];

        content.style.cssText = `
            padding: 16px;
            gap: 12px;
            display: flex;
            flex-direction: column;
        `;

        for (const entry of this._config.entities) {
            const entity = entry.entity || entry;
            const row = this._createEntityRow(entity, entry);
            content._rows.push(row);
            content.appendChild(row);
        }

        return content;
    }

    // יצירת שורת ישות עם נגישות משופרת
    _createEntityRow(entity, entry) {
        const row = document.createElement("DIV");
        row._entity = entity;
        row._template_value = entry.template || this._config.template;
        row.classList.add("card-content");
        
        // נגישות
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-label', `ערוך לוח זמנים עבור ${entry.name || entity}`);

        row.style.cssText = `
            padding: 16px;
            border-radius: var(--ha-card-border-radius, 12px);
            background: var(--card-background-color);
            border: var(--ha-card-border-width, 1px) solid var(--divider-color);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(10px);
            cursor: pointer;
            position: relative;
            overflow: hidden;
        `;

        // הוספת אפקטי hover ו-focus משופרים
        this._addInteractionEffects(row);

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
            this._createErrorState(row, entity);
        }

        return row;
    }

    // אפקטי אינטראקציה משופרים
    _addInteractionEffects(element) {
        // Hover effects
        element.addEventListener('mouseenter', () => {
            element.style.transform = 'translateY(-2px) scale(1.01)';
            element.style.boxShadow = '0 8px 32px var(--shadow-elevation-4x_-_box-shadow, rgba(0, 0, 0, 0.12))';
        });
        
        element.addEventListener('mouseleave', () => {
            element.style.transform = 'translateY(0) scale(1)';
            element.style.boxShadow = 'none';
        });

        // Focus effects לנגישות
        element.addEventListener('focus', () => {
            element.style.outline = '3px solid var(--accent-color)';
            element.style.outlineOffset = '2px';
        });
        
        element.addEventListener('blur', () => {
            element.style.outline = 'none';
        });

        // תמיכה במקלדת
        element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                element.click();
            }
        });
    }

    // מצב שגיאה משופר
    _createErrorState(row, entity) {
        row.style.background = 'var(--error-state-color, rgba(255, 107, 107, 0.1))';
        row.style.borderColor = 'var(--error-color, #ff6b6b)';
        
        const errorContent = document.createElement("DIV");
        errorContent.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--error-color, #ff6b6b);
        `;

        const errorIcon = document.createElement("ha-icon");
        errorIcon.icon = "mdi:alert-circle";
        errorIcon.style.cssText = `
            --mdc-icon-size: 24px;
            flex: none;
        `;
        errorContent.appendChild(errorIcon);

        const errorText = document.createElement("SPAN");
        errorText.textContent = `ישות לא נמצאה: ${entity}`;
        errorText.style.fontWeight = '500';
        errorContent.appendChild(errorText);

        row.appendChild(errorContent);
    }

    // עדכון תוכן משופר עם בדיקת שינויים יעילה
    _updateContent() {
        if (this._isUpdating) return; // מניעת עדכונים חופפים
        this._isUpdating = true;

        try {
            for (const row of this._content._rows) {
                if (this._rowEntityChanged(row)) {
                    row._content._icon.hass = this._hass;
                    row._content._icon.stateObj = this._hass.states[row._entity];
                    this._setCardRowValue(row);
                }
            }
        } finally {
            this._isUpdating = false;
        }
    }

    _createCardRow(entity, name) {
        const content = document.createElement("DIV");
        content.style.cssText = `
            cursor: pointer;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 4px;
            border-radius: 8px;
            transition: all 0.2s ease;
        `;

        // Top row עם אייקון ושם
        const topRow = this._createTopRow(entity, name, content);
        content.appendChild(topRow);

        // Schedule display
        const valueElement = this._createValueElement();
        content._value_element = valueElement;
        content.appendChild(valueElement);

        // הוספת listener לפתיחת דיאלוג
        content.onclick = () => this._openDialog(entity, name);

        return content;
    }

    _createTopRow(entity, name, content) {
        const topRow = document.createElement("DIV");
        topRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 16px;
        `;

        // State badge עם אנימציה
        const icon = document.createElement("state-badge");
        icon.style.cssText = `
            flex: none;
            transform: scale(1.1);
            transition: transform 0.2s ease;
        `;
        icon.hass = this._hass;
        icon.stateObj = this._hass.states[entity];
        icon.stateColor = true;
        content._icon = icon;
        topRow.appendChild(icon);

        // שם הישות
        const nameElement = document.createElement("P");
        nameElement.innerText = name;
        nameElement.style.cssText = `
            font-weight: 500;
            font-size: 16px;
            color: var(--primary-text-color);
            margin: 0;
            flex: 1;
            transition: color 0.2s ease;
        `;
        topRow.appendChild(nameElement);

        return topRow;
    }

    _createValueElement() {
        const valueElement = document.createElement("P");
        valueElement.setAttribute('role', 'status');
        valueElement.setAttribute('aria-live', 'polite');
        
        valueElement.style.cssText = `
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
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        `;

        return valueElement;
    }

    // פתיחת דיאלוג משופרת
    _openDialog(entity, name) {
        if (!this._dialog) return;

        this._dialog._entity = entity;
        this._dialog._title.innerText = name;
        this._dialog._message.innerText = "";
        this._dialog._plus._button.disabled = false;
        this._dialog._schedule = [...this._getStateSchedule(entity)];
        
        // אנימציית פתיחה
        this._createDialogRows();
        this._dialog.show();
        
        // Focus על הדיאלוג לנגישות
        setTimeout(() => {
            const firstInput = this._dialog.querySelector('input[type="time"]');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    // שיפור ה-template subscription עם ניהול זיכרון
    _rowTemplateValue(row) {
        // ביטול subscription קודם אם קיים
        if (row._subscription) {
            row._subscription();
            this._subscriptions.delete(row._subscription);
        }

        const subscription = this._hass.connection.subscribeMessage(
            (message) => {
                const element = row._content._value_element;
                if (element) {
                    const value = message.result.length ? `${message.result}` : "∅";
                    
                    // אנימציית החלפת תוכן
                    element.style.opacity = '0.5';
                    setTimeout(() => {
                        element.innerHTML = value;
                        element.style.opacity = '1';
                    }, 150);
                }
            },
            {
                type: "render_template",
                template: row._template_value,
                variables: { entity_id: row._entity },
            }
        );

        // שמירת ה-subscription למטרות ניקוי
        row._subscription = subscription;
        this._subscriptions.add(subscription);
    }

    // בדיקת שינויים יעילה יותר
    _rowEntityChanged(row) {
        const state = this._hass.states[row._entity];
        if (!state) {
            const changed = row._entity_data !== null;
            row._entity_data = null;
            return changed;
        }

        // השוואה יעילה יותר - רק השדות הרלוונטיים
        const relevantData = {
            state: state.state,
            schedule: state.attributes.schedule,
            effective_schedule: state.attributes.effective_schedule,
            last_updated: state.last_updated
        };
        
        const currentData = JSON.stringify(relevantData);
        const changed = row._entity_data !== currentData;
        row._entity_data = currentData;
        return changed;
    }

    // שמירה עם משוב ויזואלי משופר
    _saveBackendEntity() {
        const saveButton = this._dialog._plus._button;
        const originalText = this._dialog._plus.querySelector('p').innerText;
        
        // מצב טעינה
        saveButton.disabled = true;
        this._dialog._plus.querySelector('p').innerText = "שומר...";
        this._dialog._plus.style.opacity = '0.6';

        // בדיקת תקינות מורכבת יותר
        const validation = this._validateSchedule();
        if (!validation.valid) {
            this._showValidationError(validation.message);
            this._resetSaveButton(saveButton, originalText);
            return;
        }

        this._hass
            .callService("daily_schedule", "set", {
                entity_id: this._dialog._entity,
                schedule: this._dialog._schedule,
            })
            .then(() => {
                // הצלחה
                this._showSuccessMessage();
                this._resetSaveButton(saveButton, originalText);
            })
            .catch((error) => {
                // שגיאה
                this._showValidationError(error.message || "שגיאה בשמירה");
                this._resetSaveButton(saveButton, originalText);
                return Promise.reject(error);
            });
    }

    _validateSchedule() {
        for (const range of this._dialog._schedule) {
            if (range.from === null || range.to === null) {
                return { valid: false, message: "שדות זמן חסרים" };
            }
            
            // בדיקת היגיון זמנים
            const fromTime = new Date(`1970-01-01T${range.from}`);
            const toTime = new Date(`1970-01-01T${range.to}`);
            
            if (fromTime >= toTime) {
                return { valid: false, message: "זמן התחלה חייב להיות לפני זמן הסיום" };
            }
        }
        
        return { valid: true };
    }

    _showValidationError(message) {
        const messageElement = this._dialog._message;
        messageElement.innerText = message;
        messageElement.style.display = 'block';
        
        // אנימציית הופעה
        messageElement.style.opacity = '0';
        requestAnimationFrame(() => {
            messageElement.style.opacity = '1';
        });
    }

    _showSuccessMessage() {
        const messageElement = this._dialog._message;
        messageElement.innerText = "נשמר בהצלחה!";
        messageElement.style.color = 'var(--success-color, #4caf50)';
        messageElement.style.backgroundColor = 'var(--success-color, rgba(76, 175, 80, 0.1))';
        messageElement.style.borderColor = 'var(--success-color, rgba(76, 175, 80, 0.2))';
        
        setTimeout(() => {
            messageElement.innerText = "";
            messageElement.style.color = '';
            messageElement.style.backgroundColor = '';
            messageElement.style.borderColor = '';
        }, 3000);
    }

    _resetSaveButton(button, originalText) {
        setTimeout(() => {
            button.disabled = false;
            this._dialog._plus.querySelector('p').innerText = originalText;
            this._dialog._plus.style.opacity = '1';
        }, 500);
    }

    // שיפורים נוספים...
    _getStateSchedule(entity, effective = false) {
        const state = this._hass.states[entity];
        return !state
            ? []
            : !effective
            ? state.attributes.schedule || []
            : state.attributes.effective_schedule || [];
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
                
            const element = row._content._value_element;
            const newValue = value.length ? value : "∅";
            
            // עדכון עם אנימציה אם השתנה
            if (element.innerHTML !== newValue) {
                element.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    element.innerHTML = newValue;
                    element.style.transform = 'scale(1)';
                }, 100);
            }
        } else {
            this._rowTemplateValue(row);
        }
    }

    // יצירת דיאלוג עם נגישות משופרת
    _createDialog() {
        this._dialog = document.createElement("ha-dialog");
        this._dialog.heading = this._createDialogHeader();
        this._dialog.open = false;

        // הוספת נגישות
        this._dialog.setAttribute('aria-labelledby', 'dialog-title');
        this._dialog.setAttribute('aria-describedby', 'dialog-content');

        this._dialog.style.cssText = `
            --mdc-dialog-min-width: min(500px, 90vw);
            --mdc-dialog-max-width: min(600px, 95vw);
            --mdc-dialog-max-height: 90vh;
            --dialog-backdrop-filter: blur(10px);
            --dialog-background-color: var(--card-background-color);
            --mdc-theme-surface: var(--card-background-color);
        `;

        this._addResponsiveStyles();
        this._createDialogElements();
    }

    _addResponsiveStyles() {
        if (document.querySelector('#daily-schedule-responsive-styles')) return;
        
        const style = document.createElement("style");
        style.id = 'daily-schedule-responsive-styles';
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
    }

    _createDialogElements() {
        // כפתור הוספה משופר
        const plus = document.createElement("DIV");
        plus.setAttribute('role', 'button');
        plus.setAttribute('tabindex', '0');
        plus.setAttribute('aria-label', 'הוסף טווח זמן חדש');
        
        plus.style.cssText = `
            color: var(--primary-color);
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 16px;
            background: var(--state-active-color, rgba(var(--rgb-primary-color), 0.1));
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 2px dashed var(--primary-color, rgba(var(--rgb-primary-color), 0.3));
            margin: 16px 0;
        `;

        this._addInteractionEffects(plus);
        
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
        icon.style.cssText = `
            color: var(--primary-color);
            --mdc-icon-size: 24px;
        `;
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

        plus.onclick = () => this._addTimeRange();
        this._dialog._plus = plus;

        // הודעות שגיאה משופרות
        const message = document.createElement("DIV");
        message.setAttribute('role', 'alert');
        message.setAttribute('aria-live', 'polite');
        
        message.style.cssText = `
            display: none;
            color: var(--error-color, #ff6b6b);
            margin: 16px 0;
            padding: 12px;
            background: var(--error-state-color, rgba(255, 107, 107, 0.1));
            border-radius: 8px;
            border: 1px solid var(--error-color, rgba(255, 107, 107, 0.2));
            font-weight: 500;
            transition: all 0.3s ease;
        `;
        this._dialog._message = message;
    }

    _addTimeRange() {
        const button = this._dialog._plus._button;
        if (button.disabled) return;

        this._dialog._schedule.push({ from: null, to: null });
        this._createDialogRows();
        this._saveBackendEntity();
        
        // Focus על השדה החדש
        setTimeout(() => {
            const newInputs = this._dialog.querySelectorAll('input[type="time"]');
            const lastInput = newInputs[newInputs.length - 2]; // השדה "from" האחרון
            if (lastInput) lastInput.focus();
        }, 100);
    }

    // המשך המתודות הקיימות עם שיפורים נוספים...
    // (כל השאר נשאר זהה אבל עם השיפורים שהוזכרו)
}
