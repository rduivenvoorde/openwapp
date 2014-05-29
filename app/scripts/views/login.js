define([
  'backbone',
  'zeptojs',
  'global',
  'templates',
  'utils/phonenumber',
  'collections/countries'
], function (Backbone, $, global, templates, PhoneNumber, CountriesCollection) {
  'use strict';

  var localStorage = window.localStorage;

  var Login = Backbone.View.extend({

    el: '#main-page',

    template: templates.login,

    previousPages: [],

    currentPage: 'init',

    initialize: function () {
      this.mcc = 0;
      this.getMcc();
      this.countryTables = new CountriesCollection();
    },

    events: {
      'submit #register':         'gotoConfirmation',
      'submit #register-conf':    'validate',
      'click button':             'goToValidate',
      'click .btn-back':          'back',
      'change select':            'setCountryPrefix',
      'click  legend':            'showSelect',
      'click  .tos a':            'showTOS'
    },

    render: function () {
      if (global.updateNeeded) {
        console.log('Old app version. Need to update');
        this.$el.html(templates.updateNeeded);
      } else {
        var message, stringId;
        var l10n = global.localisation[global.language];
        var _this = this;

        // No country found
        if (this.mcc === 0 || isNaN(this.mcc)) {
          stringId = 'countryNotDetectedOnLogin';
          message = l10n[stringId];
        }
        // Country found, show a proper message
        else {
          var interpolate = global.l10nUtils.interpolate;
          stringId = 'countryDetectedOnLogin';
          message = interpolate(l10n[stringId], {
            country: this.countryTables.getCountryByMCC(_this.mcc)
          });
        }
        var el = this.template({
          countryDetectionMessage: message
        });
        this.$el.html(el);
        this.populateCountryNames();
        this.$el.removeClass().addClass('page init');
      }
    },

    getMcc: function () {
      var mozCnx;
      var network;
      var _this = this;
      // Firefox OS 1.1-
      if ((mozCnx = navigator.mozMobileConnection)) {
        network = (mozCnx.lastKnownHomeNetwork || mozCnx.lastKnownNetwork ||
          '-').split('-');
        this.mcc = parseInt(network[0], 10);
      }
      // Firefox OS 1.2+
      else if ((mozCnx = navigator.mozMobileConnections)) {
        for (var c = 0; c < navigator.mozMobileConnections.length; c++) {
          network = (mozCnx[c].lastKnownHomeNetwork ||
            mozCnx.lastKnownNetwork || '-').split('-');
          _this.mcc = parseInt(network[0], 10);
        }
      }
      // Desktop or simulator
      else {
        console.log('mozMobileConnection not available');
      }
    },

    populateCountryNames: function () {
      var _this = this;
      var $select = this.$el.find('#register select');
      $select.html('');
      var added = {};
      this.countryTables.forEach(function (country) {
        if (!added[country.get('code')]) {
          $select.append(new Option(country.toString(), country.get('code'),
            true, (_this.mcc === country.get('mcc'))));
          added[country.get('code')] = true;
        }
      });

      if (this.mcc === 0 || isNaN(this.mcc)) {
        return;
      }

      var country = this.countryTables.getSelectedCountry($('select').val());
      this.$el.find('legend').html(country.get('prefix'));
    },

    showSelect: function () {
      var $select = this.$el.find('select');
      $select.focus();
    },

    setCountryPrefix: function (evt) {
      evt.preventDefault();
      var country = this.countryTables
          .getSelectedCountry($(evt.target).val());
      this.$el.find('legend').html(country.get('prefix'));
    },

    gotoConfirmation: function (evt) {
      evt.preventDefault();
      var country = $(evt.target).find('select').val();
      var number = $(evt.target).find('input[name=msisdn]').val();

      var international = this.checkPhoneNumber(number, country);
      if (!international) {
        return;
      }

      var $confirmationForm = this.$el.find('#register-conf');
      $confirmationForm.find('input[name=msisdn]').val(number);
      this.next('confirmation');
    },

    goToValidate: function (evt) {
      evt.preventDefault();
      var international = this._getInternational('#confirm-phone-page');
      if (!international) {
        return;
      }

      var countryCode = this.getCountryCode(international);
      var phoneNumber = international.national;

      global.router.navigate(
        'validate/' + phoneNumber + '/' + countryCode,
        { trigger: true }
      );
    },

    _getInternational: function (pageId) {
      pageId = pageId || '#login-page';
      var country = this.$el.find('select').val();
      var number = this.$el.find(pageId + ' input[name=msisdn]').val();
      return this.checkPhoneNumber(number, country);
    },

    validate: function (evt) {
      var _this = this;
      evt.preventDefault();

      var international = this._getInternational('#confirm-phone-page');
      if (!international) {
        return;
      }

      this.$el.find('section.intro > p').hide();
      this.toggleSpinner();

      var countryCode = this.getCountryCode(international);
      var phoneNumber = international.national;

      // TODO: Get locale from the i18n object (or from the phone number)
      localStorage.removeItem('isPinSent');
      global.auth.register(countryCode, phoneNumber, 'es-ES',
        function (err, details) {
          _this.toggleSpinner();
          if (err) {
            return _this.errorRegister(err, details);
          }
          var needsValidation = details;
          if (!needsValidation) {
            var destination = global.auth.get('screenName') ?
                              'inbox' : 'profile';
            global.router.navigate(destination, { trigger: true });
          }
          else {
            localStorage.setItem('isPinSent', 'true');
            localStorage.setItem('phoneAndCC', phoneNumber + '/' + countryCode);
            global.router.navigate(
              'validate/' + phoneNumber + '/' + countryCode,
              { trigger: true }
            );
          }
        }
      );

    },

    getCountryCode: function (international) {
      var prefixLength =
        international.full.length - international.national.length;
      return international.full.substr(0, prefixLength);
    },

    checkPhoneNumber: function (number, country) {
      if (!country) {
        window.alert(global.localisation[global.language].selectCountryAlert);
        return;
      }

      var international = PhoneNumber.parse(number, country);

      // show error if cannot parse number or parsed country is different.
      // PhoneNumber always change the country to uppercase, so
      // we should also for this check to work
      country = country.toUpperCase();
      if (!international || country !== international.region) {
        window.alert(global.localisation[global.language]
          .movilNumberValidationAlert);
        return;
      }
      return international;
    },

    next: function (nextPage) {
      this.previousPages.push(this.currentPage);
      this.$el.removeClass().addClass('page').addClass(nextPage);
      this.currentPage = nextPage;
    },

    back: function (evt) {
      evt.preventDefault();
      var previous = this.previousPages[this.previousPages.length - 1];
      this.$el.removeClass().addClass('page').addClass(previous);
      this.currentPage = previous;
      this.previousPages.pop(this.previousPages.length - 1);
    },

    toggleSpinner: function () {
      this.$el.find('.spinner').toggle();
      var button = this.$el.find('input[type=submit]');
      button.prop('disabled', !button.prop('disabled'));
    },

    // TODO: we need to discern other kind of errors in this method
    errorRegister: function (err, data) {
      this.$el.find('section.intro > p').show();
      if (err === 'too_recent') {
        var l10n = global.localisation[global.language];
        var interpolate = global.l10nUtils.interpolate;
        var stringId = 'registerErrorTooRecent';
        var message = interpolate(l10n[stringId], {
          minutes: Math.ceil(data / 60)
        });
        window.alert(message);
      } else if (typeof err === 'object') {
        window.alert(global.localisation[global.language]
          .registerErrorObjectAlert);
      } else if (err === 429) {
        window.alert(global.localisation[global.language]
          .registerError429Alert);
      } else {
        window.alert(global.localisation[global.language]
          .registerErrorObjectAlert);
      }
    },

    showTOS: function (evt) {
      evt.preventDefault();
      window.open(
        evt.target.href,
        global.localisation[global.language].termsOfUse, 'dialog'
      );
    }
  });

  return Login;
});
