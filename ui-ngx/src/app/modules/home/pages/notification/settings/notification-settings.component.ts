///
/// Copyright © 2016-2023 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { Component, OnInit } from '@angular/core';
import { PageComponent } from '@shared/components/page.component';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { AbstractControl, UntypedFormArray, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { HasConfirmForm } from '@core/guards/confirm-on-exit.guard';
import { TranslateService } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { deepClone, isDefinedAndNotNull } from '@core/utils';
import {
  NotificationDeliveryMethod,
  NotificationDeliveryMethodTranslateMap,
  NotificationUserSettings
} from '@shared/models/notification.models';
import { NotificationService } from '@core/http/notification.service';
import { DialogService } from '@core/services/dialog.service';

@Component({
  selector: 'tb-notification-settings',
  templateUrl: './notification-settings.component.html',
  styleUrls: ['./notification-settings.component.scss']
})
export class NotificationSettingsComponent extends PageComponent implements OnInit, HasConfirmForm {

  notificationSettings: UntypedFormGroup;

  notificationDeliveryMethods: NotificationDeliveryMethod[];
  notificationDeliveryMethodTranslateMap = NotificationDeliveryMethodTranslateMap;

  allowNotificationDeliveryMethods: Array<NotificationDeliveryMethod>;

  constructor(protected store: Store<AppState>,
              private route: ActivatedRoute,
              private translate: TranslateService,
              private dialogService: DialogService,
              private notificationService: NotificationService,
              private fb: UntypedFormBuilder,) {
    super(store);
  }

  ngOnInit() {
    this.notificationDeliveryMethods = this.getNotificationDeliveryMethods();

    this.notificationService.getAvailableDeliveryMethods({ignoreLoading: true}).subscribe(allowMethods => {
      this.allowNotificationDeliveryMethods = allowMethods;
    });

    this.buildNotificationSettingsForm();
    this.patchNotificationSettings(this.route.snapshot.data.userSettings);
  }

  private getNotificationDeliveryMethods(): NotificationDeliveryMethod[] {
    const deliveryMethods = new Set([
      NotificationDeliveryMethod.SLACK,
      NotificationDeliveryMethod.MICROSOFT_TEAMS
    ]);
    return Object.values(NotificationDeliveryMethod).filter(type => !deliveryMethods.has(type));
  }

  private buildNotificationSettingsForm() {
    this.notificationSettings = this.fb.group({
      prefs: this.fb.array([])
    });
  }

  private patchNotificationSettings(settings: NotificationUserSettings) {
    const notificationSettingsControls: Array<AbstractControl> = [];
    let preparedSettings;
    if (settings.prefs) {
      preparedSettings = this.prepareNotificationSettings(settings.prefs);
      preparedSettings.forEach((setting) => {
        setting.enabledDeliveryMethods = Object.assign(
          this.notificationDeliveryMethods.reduce((a, v) => ({ ...a, [v]: true}), {}),
          setting.enabledDeliveryMethods
        );
        notificationSettingsControls.push(this.fb.control(setting, [Validators.required]));
      });
    }
    this.notificationSettings.setControl('prefs', this.fb.array(notificationSettingsControls), {emitEvent: false});
  }

  private prepareNotificationSettings(prefs: any) {
    return Object.entries(prefs).map((value: any) => {
      value[1].name = value[0];
      return value[1];
    });
  }

  resetSettings() {
    this.dialogService.confirm(
      this.translate.instant('notification.settings.reset-all-title'),
      this.translate.instant('notification.settings.reset-all-text'),
      this.translate.instant('action.no'),
      this.translate.instant('action.yes'),
      true
    ).subscribe(
      result => {
        if (result) {
          const settings = this.prepareNotificationSettings(this.route.snapshot.data.userSettings.prefs);
          const notificationSettingsControls: Array<AbstractControl> = [];
          this.notificationSettings.reset({});
          if (settings) {
            settings.forEach((setting) => {
              setting.enabled = true;
              setting.enabledDeliveryMethods = this.notificationDeliveryMethods.reduce((a, v) => ({ ...a, [v]: true}), {});
              notificationSettingsControls.push(this.fb.control(setting, [Validators.required]));
            });
          }
          this.notificationSettings.setControl('prefs', this.fb.array(notificationSettingsControls), {emitEvent: false});
          this.save();
        }
      }
    );
  }

  getChecked = (method: NotificationDeliveryMethod = null): boolean => {
    const type = this.notificationSettings.get('prefs').value;
    if (isDefinedAndNotNull(method)) {
      return isDefinedAndNotNull(type) && type.every(resource => resource.enabledDeliveryMethods[method]);
    }
    return isDefinedAndNotNull(type) && type.every(resource => resource.enabled);
  };

  getSomeChecked = () => {
    const type = this.notificationSettings.get('prefs').value;
    return isDefinedAndNotNull(type) && type.some(resource => resource.enabled);
  };

  getIndeterminate = (deliveryMethod: NotificationDeliveryMethod = null): boolean => {
    const type = this.notificationSettings.get('prefs').value;
    if (isDefinedAndNotNull(type)) {
      const checkedResource = isDefinedAndNotNull(deliveryMethod) ?
        type.filter(resource => resource.enabledDeliveryMethods[deliveryMethod]) :
        type.filter(resource => resource.enabled);
      return checkedResource.length !== 0 && checkedResource.length !== type.length;
    }
    return false;
  };

  changeInstanceTypeCheckBox = (value: boolean, deliveryMethod: NotificationDeliveryMethod = null): void => {
    const type = deepClone(this.notificationSettings.get('prefs').value);
    if (isDefinedAndNotNull(deliveryMethod)) {
      type.forEach(notificationType => notificationType.enabledDeliveryMethods[deliveryMethod] = value);
    } else {
      type.forEach(notificationType => notificationType.enabled = value);
    }
    this.notificationSettings.get('prefs').patchValue(type);
    this.notificationSettings.markAsDirty();
  };

  get notificationSettingsFormArray(): UntypedFormArray {
    return this.notificationSettings.get('prefs') as UntypedFormArray;
  }

  save(): void {
    const settings = {prefs: {}};
    this.notificationSettings.getRawValue().prefs.forEach(value => {
      const key = value.name;
      delete value.name;
      settings.prefs[key] = value;
    });
    this.notificationService.saveNotificationUserSettings(settings).subscribe(
      (userSettings) => {
        this.notificationSettings.get('prefs').reset({});
        this.patchNotificationSettings(userSettings);
      }
    );
  }

  confirmForm(): UntypedFormGroup {
    return this.notificationSettings;
  }
}
