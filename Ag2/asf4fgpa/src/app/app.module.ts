import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { ASF2DisplayComponent } from './asf2-display/asf2-display.component';

@NgModule({
  declarations: [
    AppComponent,
    ASF2DisplayComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
