/**
 * @fileoverview Floating layer for writing new schedules
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
'use strict';

var View = require('../../view/view');
var FloatingLayer = require('../../common/floatingLayer');
var util = require('tui-code-snippet');
var DatePicker = require('tui-date-picker');
var timezone = require('../../common/timezone');
var config = require('../../config');
var domevent = require('../../common/domevent');
var domutil = require('../../common/domutil');
var common = require('../../common/common');
var datetime = require('../../common/datetime');
var tmpl = require('../template/popup/scheduleCreationPopup.hbs');
var TZDate = timezone.Date;
var MAX_WEEK_OF_MONTH = 6;

/**
 * @constructor
 * @extends {View}
 * @param {HTMLElement} container - container element
 * @param {Array.<Calendar>} calendars - calendar list used to create new schedule
 * @param {boolean} isUserAAAdmin - If the User Logged in is an Agile Apps Admin
 * @param {boolean} usageStatistics - GA tracking options in Calendar
 */
function ScheduleCreationPopup(container, calendars, isUserAAAdmin, usageStatistics) {
    var popUpCalendars;
    /* eslint-disable no-debugger, no-console */
    console.log('Init a Popup Instance');
    console.log(isUserAAAdmin);
    View.call(this, container);
    /**
     * @type {FloatingLayer}
     */
    this.layer = new FloatingLayer(null, container);

    /**
     * cached view model
     * @type {object}
     */
    this._viewModel = null;
    this.isUserAAAdmin = isUserAAAdmin;
    this._selectedCal = null;
    this._customSelection = null;
    this._schedule = null;
    this._customSelectionList = [
        {'reason': 'Reason For Out Of Office'},
        {'reason': 'Bereavement'},
        {'reason': 'Floating Holiday'},
        {'reason': 'Jury Duty'},
        {'reason': 'Offsite'},
        {'reason': 'Other'},
        {'reason': 'PTO'},
        {'reason': 'Sick'},
        {'reason': 'Training'}
    ];
    if (!this.isUserAAAdmin) {
        popUpCalendars = JSON.parse(JSON.stringify(calendars));
        popUpCalendars.forEach(function(calendar, index, object) {
            if (calendar.name === 'Holidays') {
                console.log(index);
                object.splice(index, 1);
            }
        });
        this.calendars = popUpCalendars;
    } else {
        this.calendars = calendars;
    }
    this._focusedDropdown = null;
    this._customFocusedDropdown = null;
    this._usageStatistics = usageStatistics;
    this._onClickListeners = [
        this._selectDropdownMenuItem.bind(this),
        this._selectCustomDropdownMenuItem.bind(this),
        this._toggleDropdownMenuView.bind(this),
        this._toggleCustomDropdownMenuView.bind(this),
        this._closeDropdownMenuView.bind(this, null),
        this._closeCustomDropdownMenuView.bind(this, null),
        this._closePopup.bind(this),
        this._toggleIsAllDayOrHalfDay.bind(this),
        this._toggleIsPrivate.bind(this),
        this._onClickSaveSchedule.bind(this)
    ];

    domevent.on(container, 'click', this._onClick, this);
}

util.inherit(ScheduleCreationPopup, View);

/**
 * Mousedown event handler for hiding popup layer when user mousedown outside of
 * layer
 * @param {MouseEvent} mouseDownEvent - mouse event object
 */
ScheduleCreationPopup.prototype._onMouseDown = function(mouseDownEvent) {
    var target = domevent.getEventTarget(mouseDownEvent),
        popupLayer = domutil.closest(target, config.classname('.floating-layer'));

    if (popupLayer) {
        return;
    }

    this.hide();
};

/**
 * @override
 */
ScheduleCreationPopup.prototype.destroy = function() {
    this.layer.destroy();
    this.layer = null;
    domevent.off(this.container, 'click', this._onClick, this);
    domevent.off(document.body, 'mousedown', this._onMouseDown, this);
    View.prototype.destroy.call(this);
};

/**
 * @override
 * Click event handler for close button
 * @param {MouseEvent} clickEvent - mouse event object
 */
ScheduleCreationPopup.prototype._onClick = function(clickEvent) {
    var target = domevent.getEventTarget(clickEvent);
    util.forEach(this._onClickListeners, function(listener) {
        return !listener(target);
    });
};

/**
 * Test click event target is close button, and return layer is closed(hidden)
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether popup layer is closed or not
 */
ScheduleCreationPopup.prototype._closePopup = function(target) {
    var className = config.classname('popup-close');
    if (domutil.hasClass(target, className) || domutil.closest(target, '.' + className)) {
        this.hide();

        return true;
    }

    return false;
};

/**
 * Toggle dropdown menu view, when user clicks dropdown button
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether user clicked dropdown button or not
 */
ScheduleCreationPopup.prototype._toggleDropdownMenuView = function(target) {
    var className = config.classname('dropdown-button');
    var dropdownBtn = domutil.hasClass(target, className) ? target : domutil.closest(target, '.' + className);
    var dropDown = domutil.closest(dropdownBtn, config.classname('.dropdown'));
    var popUpParent = domutil.closest(dropDown, config.classname('.popup-container'));
    var customDropDown = domutil.find(config.classname('.custom-dropdown'), popUpParent);
    if (!dropdownBtn) {
        return false;
    }
    if (domutil.hasClass(dropdownBtn.parentNode, config.classname('open'))) {
        this._closeDropdownMenuView(dropdownBtn.parentNode);
    } else {
        this._closeCustomDropdownMenuView(customDropDown);
        this._openDropdownMenuView(dropdownBtn.parentNode);
    }

    return true;
};

/**
 * Toggle custom dropdown menu view, when user clicks dropdown button
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether user clicked dropdown button or not
 */
ScheduleCreationPopup.prototype._toggleCustomDropdownMenuView = function(target) {
    var customDropDownClassName = config.classname('custom-dropdown-button');
    var customDropDownBtn = domutil.hasClass(target, customDropDownClassName) ? target : domutil.closest(target, '.' + customDropDownClassName);
    if (!customDropDownBtn) {
        return false;
    }
    if (domutil.hasClass(customDropDownBtn.parentNode, config.classname('open'))) {
        this._closeCustomDropdownMenuView(customDropDownBtn.parentNode);
    } else {
        this._openCustomDropdownMenuView(customDropDownBtn.parentNode);
    }

    return true;
};

/**
 * Close drop down menu
 * @param {HTMLElement} dropdown - dropdown element that has a opened dropdown menu
 */
ScheduleCreationPopup.prototype._closeDropdownMenuView = function(dropdown) {
    dropdown = dropdown || this._focusedDropdown;
    if (dropdown) {
        domutil.removeClass(dropdown, config.classname('open'));
        this._focusedDropdown = null;
    }
};

/**
 * Close custom drop down menu
 * @param {HTMLElement} dropdown - dropdown element that has a opened dropdown menu
 */
ScheduleCreationPopup.prototype._closeCustomDropdownMenuView = function(dropdown) {
    dropdown = dropdown || this._customFocusedDropdown;
    if (dropdown) {
        domutil.removeClass(dropdown, config.classname('open'));
        this._customFocusedDropdown = null;
    }
};

/**
 * Open drop down menu
 * @param {HTMLElement} dropdown - dropdown element that has a closed dropdown menu
 */
ScheduleCreationPopup.prototype._openDropdownMenuView = function(dropdown) {
    domutil.addClass(dropdown, config.classname('open'));
    this._focusedDropdown = dropdown;
};

/**
 * Open custom drop down menu
 * @param {HTMLElement} dropdown - dropdown element that has a closed dropdown menu
 */
ScheduleCreationPopup.prototype._openCustomDropdownMenuView = function(dropdown) {
    domutil.addClass(dropdown, config.classname('open'));
    this._customFocusedDropdown = dropdown;
};

/**
 * If click dropdown menu item, close dropdown menu
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether
 */
ScheduleCreationPopup.prototype._selectDropdownMenuItem = function(target) {
    var itemClassName = config.classname('dropdown-menu-item');
    var iconClassName = config.classname('icon');
    var contentClassName = config.classname('content');
    var selectedItem = domutil.hasClass(target, itemClassName) ? target : domutil.closest(target, '.' + itemClassName);
    var bgColor, title, dropdown, dropdownBtn;
    if (!selectedItem) {
        return false;
    }
    bgColor = domutil.find('.' + iconClassName, selectedItem).style.backgroundColor || 'transparent';
    title = domutil.find('.' + contentClassName, selectedItem).innerHTML;
    dropdown = domutil.closest(selectedItem, config.classname('.dropdown'));
    dropdownBtn = domutil.find(config.classname('.dropdown-button'), dropdown);
    domutil.find('.' + contentClassName, dropdownBtn).innerText = title;
    if (domutil.hasClass(dropdown, config.classname('section-calendar'))) {
        domutil.find('.' + iconClassName, dropdownBtn).style.backgroundColor = bgColor;
        this._selectedCal = common.find(this.calendars, function(cal) {
            return cal.id === domutil.getData(selectedItem, 'calendarId');
        });
    }
    domutil.removeClass(dropdown, config.classname('open'));

    return true;
};

/**
 * If click dropdown menu item, close dropdown menu
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether
 */
ScheduleCreationPopup.prototype._selectCustomDropdownMenuItem = function(target) {
    var customItemClassName = config.classname('custom-dropdown-menu-item');
    var customSelectedItem = domutil.hasClass(target, customItemClassName) ? target : domutil.closest(target, '.' + customItemClassName);
    var contentClassName = config.classname('content');
    var title, titlePl, customDropdown, customDropdownBtn;
    if (!customSelectedItem) {
        return false;
    }
    customDropdown = domutil.closest(customSelectedItem, config.classname('.custom-dropdown'));
    title = domutil.find('.' + contentClassName, customSelectedItem).innerHTML;
    customDropdownBtn = domutil.find(config.classname('.custom-dropdown-button'), customDropdown);
    titlePl = domutil.find('.' + contentClassName, customDropdownBtn);
    titlePl.innerText = title;
    if (domutil.hasClass(customDropdown, config.classname('section-custom-selection'))) {
        this._customSelection = domutil.getData(customSelectedItem, 'reasonId');
    }
    if (title !== 'Reason For Out Of Office') {
        domutil.removeClass(customDropdownBtn, config.classname('required'));
        domutil.removeClass(titlePl, config.classname('pl'));
    }
    domutil.removeClass(customDropdown, config.classname('open'));

    return true;
};

/**
 * Toggle allday checkbox state
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether event target is allday section or not
 */
ScheduleCreationPopup.prototype._toggleIsAllDayOrHalfDay = function(target) {
    var cssPrefix = config.cssPrefix;
    var allDayClassName = config.classname('section-allday');
    var halfDayClassName = config.classname('section-halfday');
    var allDaySection = domutil.hasClass(target, allDayClassName) ? target : domutil.closest(target, '.' + allDayClassName);
    var halfDaySection = domutil.hasClass(target, halfDayClassName) ? target : domutil.closest(target, '.' + halfDayClassName);
    var allDayCheckbox, halfDayCheckbox;
    if (allDaySection || halfDaySection) {
        allDayCheckbox = domutil.get(cssPrefix + 'schedule-allday');
        halfDayCheckbox = domutil.get(cssPrefix + 'schedule-halfday');
        halfDayCheckbox.checked = !halfDayCheckbox.checked;
        allDayCheckbox.checked = !allDayCheckbox.checked;

        return true;
    }

    return false;
};

/**
 * Toggle private button
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether event target is private section or not
 */
ScheduleCreationPopup.prototype._toggleIsPrivate = function(target) {
    var className = config.classname('section-private');
    var privateSection = domutil.hasClass(target, className) ? target : domutil.closest(target, '.' + className);
    if (privateSection) {
        if (domutil.hasClass(privateSection, config.classname('public'))) {
            domutil.removeClass(privateSection, config.classname('public'));
        } else {
            domutil.addClass(privateSection, config.classname('public'));
        }

        return true;
    }

    return false;
};

/**
 * Save new schedule if user clicked save button
 * @emits ScheduleCreationPopup#saveSchedule
 * @param {HTMLElement} target click event target
 * @returns {boolean} whether save button is clicked or not
 */
// eslint-disable-next-line complexity
ScheduleCreationPopup.prototype._onClickSaveSchedule = function(target) {
    var className = config.classname('popup-save');
    var cssPrefix = config.cssPrefix;
    // var title;
    var customSelection, customTextInput, startDate, endDate, rangeDate, form, isAllDay, isHalfDay, calendarName;

    if (!domutil.hasClass(target, className) && !domutil.closest(target, '.' + className)) {
        return false;
    }

    // title = domutil.get(cssPrefix + 'schedule-title');
    startDate = new TZDate(this.rangePicker.getStartDate()).toLocalTime();
    endDate = new TZDate(this.rangePicker.getEndDate()).toLocalTime();
    customSelection = domutil.get(cssPrefix + 'schedule-custom-selection');
    customTextInput = domutil.get(cssPrefix + 'schedule-custom-text-input');
    calendarName = this._selectedCal ? this._selectedCal.name : null;
    /* eslint-disable no-debugger, no-console */
    console.log('Before Saving Schedule, Printing time');
    console.log(startDate);
    console.log(endDate);
    console.log(calendarName);
    if (!this._validateForm(customSelection, customTextInput, startDate, endDate, calendarName)) {
        return false;
    }
    isAllDay = !!domutil.get(cssPrefix + 'schedule-allday').checked;
    isHalfDay = !!domutil.get(cssPrefix + 'schedule-halfday').checked;
    rangeDate = this._getRangeDate(startDate, endDate, isAllDay);

    form = {
        calendarId: this._selectedCal ? this._selectedCal.id : null,
        /*
        title: title,
        location: domutil.get(cssPrefix + 'schedule-location'),
        state: domutil.get(cssPrefix + 'schedule-state').innerText,
        isPrivate: !domutil.hasClass(domutil.get(cssPrefix + 'schedule-private'), config.classname('public')),
        */
        customSelection: customSelection,
        customTextInput: customTextInput,
        start: rangeDate.start,
        end: rangeDate.end,
        isAllDay: isAllDay,
        isHalfDay: isHalfDay
    };

    if (this._isEditMode) {
        this._onClickUpdateSchedule(form);
    } else {
        this._onClickCreateSchedule(form);
    }

    this.hide();

    return true;
};

/**
 * @override
 * @param {object} viewModel - view model from factory/monthView
 */
ScheduleCreationPopup.prototype.render = function(viewModel) {
    var calendars = this.calendars;
    var layer = this.layer;
    var self = this;
    var boxElement, guideElements;
    /* eslint-disable no-debugger, no-console */
    console.log('Initial View Model');
    console.log(viewModel);
    viewModel.zIndex = this.layer.zIndex + 5;
    viewModel.calendars = calendars;
    viewModel.customSelectionList = this._customSelectionList;
    if (calendars.length) {
        viewModel.selectedCal = this._selectedCal = calendars[0];
    }
    viewModel.customSelection = this._customSelection = this._customSelectionList[0].reason;
    this._isEditMode = viewModel.schedule && viewModel.schedule.id;
    if (this._isEditMode) {
        boxElement = viewModel.target;
        viewModel = this._makeEditModeData(viewModel);
    } else {
        this.guide = viewModel.guide;
        guideElements = this._getGuideElements(this.guide);
        boxElement = guideElements.length ? guideElements[0] : null;
    }
    /* eslint-disable no-debugger, no-console */
    console.log('View Model after changes');
    console.log(viewModel);
    layer.setContent(tmpl(viewModel));
    this._createDatepicker(viewModel.start, viewModel.end, true);
    layer.show();

    if (boxElement) {
        this._setPopupPositionAndArrowDirection(boxElement.getBoundingClientRect());
    }

    util.debounce(function() {
        domevent.on(document.body, 'mousedown', self._onMouseDown, self);
    })();
};

/**
 * Make view model for edit mode
 * @param {object} viewModel - original view model from 'beforeCreateEditPopup'
 * @returns {{isAllDay: *, calendars: Array<Calendar>, isEditMode: *, selectedCal: null, start: *, end: *, customSelectionList, customSelection, customTextInput, id: *, title: *, isHalfDay: (boolean|{boolean}), zIndex: number}} - edit mode view model
 */
ScheduleCreationPopup.prototype._makeEditModeData = function(viewModel) {
    var schedule = viewModel.schedule;
    // eslint-disable-next-line no-unused-vars
    var title, isPrivate, location, startDate, endDate;
    // eslint-disable-next-line no-unused-vars
    var isAllDay, isHalfDay, state, customSelectionList, customSelection, customTextInput;
    // var raw = schedule.raw || {};
    var calendars = this.calendars;
    var id = schedule.id;
    /*
    isPrivate = raw['class'] === 'private';
    location = schedule.location;
    state = schedule.state;
    */
    title = schedule.title;
    startDate = schedule.start;
    endDate = schedule.end;
    isAllDay = schedule.isAllDay;
    isHalfDay = schedule.isHalfDay;
    customTextInput = schedule.customTextInput;
    viewModel.selectedCal = this._selectedCal = common.find(this.calendars, function(cal) {
        return cal.id === viewModel.schedule.calendarId;
    });
    this._schedule = schedule;
    customSelectionList = this._customSelectionList;
    viewModel.customSelection = this._customSelection = schedule.customSelection;

    return {
        id: id,
        selectedCal: this._selectedCal,
        calendars: calendars,
        title: title,
        // isPrivate: isPrivate,
        // location: location,
        isAllDay: isAllDay,
        isHalfDay: isHalfDay,
        // state: state,
        start: startDate,
        end: endDate,
        customSelectionList: customSelectionList,
        customSelection: this._customSelection,
        customTextInput: customTextInput,
        /* raw: {
            class: isPrivate ? 'private' : 'public'
        }, */
        zIndex: this.layer.zIndex + 5,
        isEditMode: this._isEditMode
    };
};

/**
 * Set popup position and arrow direction to apear near guide element
 * @param {MonthCreationGuide|TimeCreationGuide|DayGridCreationGuide} guideBound - creation guide element
 */
ScheduleCreationPopup.prototype._setPopupPositionAndArrowDirection = function(guideBound) {
    var layer = domutil.find(config.classname('.popup'), this.layer.container);
    var layerSize = {
        width: layer.offsetWidth,
        height: layer.offsetHeight
    };
    var containerBound = this.container.getBoundingClientRect();
    var pos = this._calcRenderingData(layerSize, containerBound, guideBound);

    this.layer.setPosition(pos.x, pos.y);
    this._setArrowDirection(pos.arrow);
};

/**
 * Get guide elements from creation guide object
 * It is used to calculate rendering position of popup
 * It will be disappeared when hiding popup
 * @param {MonthCreationGuide|TimeCreationGuide|AlldayCreationGuide} guide - creation guide
 * @returns {Array.<HTMLElement>} creation guide element
 */
ScheduleCreationPopup.prototype._getGuideElements = function(guide) {
    var guideElements = [];
    var i = 0;

    if (guide.guideElement) {
        guideElements.push(guide.guideElement);
    } else if (guide.guideElements) {
        for (; i < MAX_WEEK_OF_MONTH; i += 1) {
            if (guide.guideElements[i]) {
                guideElements.push(guide.guideElements[i]);
            }
        }
    }

    return guideElements;
};

/**
 * Get guide element's bound data which only includes top, right, bottom, left
 * @param {Array.<HTMLElement>} guideElements - creation guide elements
 * @returns {Object} - popup bound data
 */
ScheduleCreationPopup.prototype._getBoundOfFirstRowGuideElement = function(guideElements) {
    var bound;

    if (!guideElements.length) {
        return null;
    }

    bound = guideElements[0].getBoundingClientRect();

    return {
        top: bound.top,
        left: bound.left,
        bottom: bound.bottom,
        right: bound.right
    };
};

/**
 * Get calculate rendering positions of y and arrow direction by guide block elements
 * @param {number} guideBoundTop - guide block's top
 * @param {number} guideBoundBottom - guide block's bottom
 * @param {number} layerHeight - popup layer's height
 * @param {number} containerTop - container's top
 * @param {number} containerBottom - container's bottom
 * @returns {YAndArrowDirection} y and arrowDirection
 */
ScheduleCreationPopup.prototype._getYAndArrowDirection = function(
    guideBoundTop,
    guideBoundBottom,
    layerHeight,
    containerTop,
    containerBottom
) {
    var arrowDirection = 'arrow-bottom';
    var MARGIN = 3;
    var y = guideBoundTop - layerHeight;

    if (y < containerTop) {
        y = guideBoundBottom - containerTop + MARGIN;
        arrowDirection = 'arrow-top';
    } else {
        y = y - containerTop - MARGIN;
    }

    if (y + layerHeight > containerBottom) {
        y = containerBottom - layerHeight - containerTop - MARGIN;
    }

    /**
     * @typedef {Object} YAndArrowDirection
     * @property {number} y - top position of popup layer
     * @property {string} [arrowDirection] - direction of popup arrow
     */
    return {
        y: y,
        arrowDirection: arrowDirection
    };
};

/**
 * Get calculate rendering x position and arrow left by guide block elements
 * @param {number} guideBoundLeft - guide block's left
 * @param {number} guideBoundRight - guide block's right
 * @param {number} layerWidth - popup layer's width
 * @param {number} containerLeft - container's left
 * @param {number} containerRight - container's right
 * @returns {XAndArrowLeft} x and arrowLeft
 */
ScheduleCreationPopup.prototype._getXAndArrowLeft = function(
    guideBoundLeft,
    guideBoundRight,
    layerWidth,
    containerLeft,
    containerRight
) {
    var guideHorizontalCenter = (guideBoundLeft + guideBoundRight) / 2;
    var x = guideHorizontalCenter - (layerWidth / 2);
    var ARROW_WIDTH_HALF = 8;
    var arrowLeft;

    if (x + layerWidth > containerRight) {
        x = guideBoundRight - layerWidth + ARROW_WIDTH_HALF;
        arrowLeft = guideHorizontalCenter - x;
    } else {
        x += ARROW_WIDTH_HALF;
    }

    if (x < containerLeft) {
        x = 0;
        arrowLeft = guideHorizontalCenter - containerLeft - ARROW_WIDTH_HALF;
    } else {
        x = x - containerLeft - ARROW_WIDTH_HALF;
    }

    /**
     * @typedef {Object} XAndArrowLeft
     * @property {number} x - left position of popup layer
     * @property {numbe3er} arrowLeft - relative position of popup arrow, if it is not set, arrow appears on the middle of popup
     */
    return {
        x: x,
        arrowLeft: arrowLeft
    };
};

/**
 * Calculate rendering position usering guide elements
 * @param {{width: {number}, height: {number}}} layerSize - popup layer's width and height
 * @param {{top: {number}, left: {number}, right: {number}, bottom: {number}}} containerBound - width and height of the upper layer, that acts as a border of popup
 * @param {{top: {number}, left: {number}, right: {number}, bottom: {number}}} guideBound - guide element bound data
 * @returns {PopupRenderingData} rendering position of popup and popup arrow
 */
ScheduleCreationPopup.prototype._calcRenderingData = function(layerSize, containerBound, guideBound) {
    var yPosInfo = this._getYAndArrowDirection(
        guideBound.top,
        guideBound.bottom,
        layerSize.height,
        containerBound.top,
        containerBound.bottom
    );
    var xPosInfo = this._getXAndArrowLeft(
        guideBound.left,
        guideBound.right,
        layerSize.width,
        containerBound.left,
        containerBound.right
    );

    /**
     * @typedef {Object} PopupRenderingData
     * @property {number} x - left position
     * @property {number} y - top position
     * @property {string} arrow.direction - direction of popup arrow
     * @property {number} [arrow.position] - relative position of popup arrow, if it is not set, arrow appears on the middle of popup
     */
    return {
        x: xPosInfo.x,
        y: yPosInfo.y,
        arrow: {
            direction: yPosInfo.arrowDirection,
            position: xPosInfo.arrowLeft
        }
    };
};

/**
 * Set arrow's direction and position
 * @param {Object} arrow rendering data for popup arrow
 */
ScheduleCreationPopup.prototype._setArrowDirection = function(arrow) {
    var direction = arrow.direction || 'arrow-bottom';
    var arrowEl = domutil.get(config.classname('popup-arrow'));
    var borderElement = domutil.find(config.classname('.popup-arrow-border', arrowEl));

    if (direction !== config.classname('arrow-bottom')) {
        domutil.removeClass(arrowEl, config.classname('arrow-bottom'));
        domutil.addClass(arrowEl, config.classname(direction));
    }

    if (arrow.position) {
        borderElement.style.left = arrow.position + 'px';
    }
};

/**
 * Create date range picker using start date and end date
 * @param {TZDate} start - start date
 * @param {TZDate} end - end date
 * @param {boolean} isAllDay - isAllDay
 */
ScheduleCreationPopup.prototype._createDatepicker = function(start, end, isAllDay) {
    var cssPrefix = config.cssPrefix;

    this.rangePicker = DatePicker.createRangePicker({
        startpicker: {
            date: new TZDate(start).toDate(),
            input: '#' + cssPrefix + 'schedule-start-date',
            container: '#' + cssPrefix + 'startpicker-container'
        },
        endpicker: {
            date: new TZDate(end).toDate(),
            input: '#' + cssPrefix + 'schedule-end-date',
            container: '#' + cssPrefix + 'endpicker-container'
        },
        format: isAllDay ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm',
        timepicker: isAllDay ? null : {
            showMeridiem: false,
            usageStatistics: this._usageStatistics
        },
        usageStatistics: this._usageStatistics
    });
};

/**
 * Hide layer
 */
ScheduleCreationPopup.prototype.hide = function() {
    this.layer.hide();

    if (this.guide) {
        this.guide.clearGuideElement();
        this.guide = null;
    }

    domevent.off(document.body, 'mousedown', this._onMouseDown, this);
};

/**
 * refresh layer
 */
ScheduleCreationPopup.prototype.refresh = function() {
    if (this._viewModel) {
        this.layer.setContent(this.tmpl(this._viewModel));
    }
};

/**
 * Set calendar list
 * @param {Array.<Calendar>} calendars - calendar list
 */
ScheduleCreationPopup.prototype.setCalendars = function(calendars) {
    var popupCalendars;
    if (!this.isUserAAAdmin) {
        popupCalendars = JSON.parse(JSON.stringify(calendars));
        popupCalendars.forEach(function(calendar, index, object) {
            if (calendar.name === 'Holidays') {
                console.log(index);
                object.splice(index, 1);
            }
        });
        this.calendars = popupCalendars || [];
    } else {
        this.calendars = calendars || [];
    }
};

/**
 * Validate the form
 * @param {string} customSelection Custom Selection of then entered schedule
 * @param {string} customTextInput Custom Input Text of then entered schedule
 * @param {TZDate} startDate start date time from range picker
 * @param {TZDate} endDate end date time from range picker
 * @param {string} calendarName Name of the Calendar selected on the schedule
 * @returns {boolean} Returns false if the form is not valid for submission.
 */
// eslint-disable-next-line max-len
ScheduleCreationPopup.prototype._validateForm = function(customSelection, customTextInput, startDate, endDate, calendarName) {
    var customDropDownBtnClassName = config.classname('.custom-dropdown-button');
    var customDropDownBtn = domutil.find(customDropDownBtnClassName);
    if (customSelection.innerText === 'Reason For Out Of Office' && calendarName !== 'Holidays') {
        domutil.addClass(customDropDownBtn, config.classname('required'));

        return false;
    }
    if (!startDate && !endDate) {
        return false;
    }

    return datetime.compare(startDate, endDate) !== 1;
};

/**
 * Get range date from range picker
 * @param {TZDate} startDate start date time from range picker
 * @param {TZDate} endDate end date time from range picker
 * @param {boolean} isAllDay whether it is an all-day schedule
 * @returns {RangeDate} Returns the start and end time data that is the range date
 */
ScheduleCreationPopup.prototype._getRangeDate = function(startDate, endDate, isAllDay) {
    var start = isAllDay ? datetime.start(startDate) : startDate;
    var end = isAllDay ? datetime.renderEnd(startDate, endDate) : endDate;

    /**
     * @typedef {object} RangeDate
     * @property {TZDate} start start time
     * @property {TZDate} end end time
     */
    return {
        start: new TZDate(start),
        end: new TZDate(end)
    };
};

/**
 * Request schedule model creation to controller by custom schedules.
 * @fires {ScheduleCreationPopup#beforeUpdateSchedule}
 * @param {{
    calendarId: {string},
    title: {string},
    customSelection: {string},
    customTextInput : {string},
    location: {string},
    start: {TZDate},
    end: {TZDate},
    isAllDay: {boolean},
    isHalfDay: {boolean},
    state: {string},
    isPrivate: {boolean}
  }} form schedule input form data
 */
ScheduleCreationPopup.prototype._onClickUpdateSchedule = function(form) {
    var changes = common.getScheduleChanges(
        this._schedule,
        ['calendarId', 'customSelection', 'customTextInput', 'start', 'end', 'isAllDay', 'isHalfDay'],
        {
            calendarId: form.calendarId,
            customSelection: form.customSelection.value,
            customTextInput: form.customTextInput.value,
            /*
            title: form.title.value,
            location: form.location.value,
            state: form.state,
            */
            start: form.start,
            end: form.end,
            isAllDay: form.isAllDay,
            isHalfDay: form.isHalfDay
        }
    );

    /**
     * @event ScheduleCreationPopup#beforeUpdateSchedule
     * @type {object}
     * @property {Schedule} schedule - schedule object to be updated
     */
    this.fire('beforeUpdateSchedule', {
        schedule: util.extend({
            raw: {
                class: form.isPrivate ? 'private' : 'public'
            }
        }, this._schedule),
        changes: changes,
        start: form.start,
        end: form.end,
        calendar: this._selectedCal,
        triggerEventName: 'click'
    });
};

/**
 * Request the controller to update the schedule model according to the custom schedule.
 * @fires {ScheduleCreationPopup#beforeCreateSchedule}
 * @param {{
    calendarId: {string},
    title: {string},
    location: {string},
    start: {TZDate},
    end: {TZDate},
    isAllDay: {boolean},
    isHalfDay: {boolean},
    state: {string},
    customSelection: {string},
    customTextInput: {string}
  }} form schedule input form data
 */
ScheduleCreationPopup.prototype._onClickCreateSchedule = function(form) {
    /**
     * @event ScheduleCreationPopup#beforeCreateSchedule
     * @type {object}
     * @property {Schedule} schedule - new schedule instance to be added
     */
    this.fire('beforeCreateSchedule', {
        calendarId: form.calendarId,
        customSelection: form.customSelection.innerText,
        customTextInput: form.customTextInput.value,
        /*
        title: form.title.value,
        state: form.state,
        location: form.location.value,
        raw: {
            class: form.isPrivate ? 'private' : 'public'
        },*/
        start: form.start,
        end: form.end,
        isAllDay: form.isAllDay,
        isHalfDay: form.isHalfDay
    });
};

module.exports = ScheduleCreationPopup;
