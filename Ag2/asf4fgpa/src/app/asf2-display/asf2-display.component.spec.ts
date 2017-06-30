import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ASF2DisplayComponent } from './asf2-display.component';

describe('ASF2DisplayComponent', () => {
  let component: ASF2DisplayComponent;
  let fixture: ComponentFixture<ASF2DisplayComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ASF2DisplayComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ASF2DisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
