import Cards from '/models/cards';
import Boards from '/models/boards';

const subManager = new SubsManager();
const { calculateIndexData, capitalize } = Utils;

function initSorting(items) {
  items.sortable({
    tolerance: 'pointer',
    helper: 'clone',
    items: '.js-checklist-item:not(.placeholder)',
    connectWith: '.js-checklist-items',
    appendTo: 'parent',
    distance: 7,
    placeholder: 'checklist-item placeholder',
    scroll: true,
    start(evt, ui) {
      ui.placeholder.height(ui.helper.height());
      EscapeActions.clickExecute(evt.target, 'inlinedForm');
    },
    stop(evt, ui) {
      const parent = ui.item.parents('.js-checklist-items');
      const checklistId = Blaze.getData(parent.get(0)).checklist._id;
      let prevItem = ui.item.prev('.js-checklist-item').get(0);
      if (prevItem) {
        prevItem = Blaze.getData(prevItem).item;
      }
      let nextItem = ui.item.next('.js-checklist-item').get(0);
      if (nextItem) {
        nextItem = Blaze.getData(nextItem).item;
      }
      const nItems = 1;
      const sortIndex = calculateIndexData(prevItem, nextItem, nItems);
      const checklistDomElement = ui.item.get(0);
      const checklistData = Blaze.getData(checklistDomElement);
      const checklistItem = checklistData.item;

      items.sortable('cancel');

      checklistItem.move(checklistId, sortIndex.base);
    },
  });
}

BlazeComponent.extendComponent({
  onRendered() {
    const self = this;
    self.itemsDom = this.$('.js-checklist-items');
    initSorting(self.itemsDom);
    self.itemsDom.mousedown(function(evt) {
      evt.stopPropagation();
    });

    function userIsMember() {
      return Meteor.user() && Meteor.user().isBoardMember();
    }

    // Disable sorting if the current user is not a board member
    self.autorun(() => {
      const $itemsDom = $(self.itemsDom);
      if ($itemsDom.data('uiSortable') || $itemsDom.data('sortable')) {
        $(self.itemsDom).sortable('option', 'disabled', !userIsMember());
        if (Utils.isMiniScreenOrShowDesktopDragHandles()) {
          $(self.itemsDom).sortable({
            handle: 'span.fa.checklistitem-handle',
          });
        }
      }
    });
  },

  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },
}).register('checklistDetail');

BlazeComponent.extendComponent({
  addChecklist(event) {
    event.preventDefault();
    const textarea = this.find('textarea.js-add-checklist-item');
    const title = textarea.value.trim();
    let cardId = this.currentData().cardId;
    const card = Cards.findOne(cardId);
    if (card.isLinked()) cardId = card.linkedId;

    if (title) {
      Checklists.insert({
        cardId,
        title,
        sort: card.checklists().count(),
      });
      this.closeAllInlinedForms();
      setTimeout(() => {
        this.$('.add-checklist-item')
          .last()
          .click();
      }, 100);
    }
  },
  addChecklistItem(event) {
    event.preventDefault();
    const textarea = this.find('textarea.js-add-checklist-item');
    const title = textarea.value.trim();
    const checklist = this.currentData().checklist;

    if (title) {
      ChecklistItems.insert({
        title,
        checklistId: checklist._id,
        cardId: checklist.cardId,
        sort: Utils.calculateIndexData(checklist.lastItem()).base,
      });
    }
    // We keep the form opened, empty it.
    textarea.value = '';
    textarea.focus();
  },

  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },

  deleteChecklist() {
    const checklist = this.currentData().checklist;
    if (checklist && checklist._id) {
      Checklists.remove(checklist._id);
      this.toggleDeleteDialog.set(false);
    }
  },

  deleteItem() {
    const checklist = this.currentData().checklist;
    const item = this.currentData().item;
    if (checklist && item && item._id) {
      ChecklistItems.remove(item._id);
    }
  },

  editChecklist(event) {
    event.preventDefault();
    const textarea = this.find('textarea.js-edit-checklist-item');
    const title = textarea.value.trim();
    const checklist = this.currentData().checklist;
    checklist.setTitle(title);
  },

  editChecklistItem(event) {
    event.preventDefault();

    const textarea = this.find('textarea.js-edit-checklist-item');
    const title = textarea.value.trim();
    const item = this.currentData().item;
    item.setTitle(title);
  },

  onCreated() {
    this.toggleDeleteDialog = new ReactiveVar(false);
    this.checklistToDelete = null; //Store data context to pass to checklistDeleteDialog template
  },

  pressKey(event) {
    //If user press enter key inside a form, submit it
    //Unless the user is also holding down the 'shift' key
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      const $form = $(event.currentTarget).closest('form');
      $form.find('button[type=submit]').click();
    }
  },

  focusChecklistItem(event) {
    // If a new checklist is created, pre-fill the title and select it.
    const checklist = this.currentData().checklist;
    if (!checklist) {
      const textarea = event.target;
      textarea.value = capitalize(TAPi18n.__('r-checklist'));
      textarea.select();
    }
  },

  /** closes all inlined forms (checklist and checklist-item input fields) */
  closeAllInlinedForms() {
    this.$('.js-close-inlined-form').click();
  },

  events() {
    const events = {
      'click .toggle-delete-checklist-dialog'(event) {
        if ($(event.target).hasClass('js-delete-checklist')) {
          this.checklistToDelete = this.currentData().checklist; //Store data context
        }
        this.toggleDeleteDialog.set(!this.toggleDeleteDialog.get());
      },
      'click #toggleHideCheckedItemsButton'() {
        Meteor.call('toggleHideCheckedItems');
      },
    };

    return [
      {
        ...events,
        'submit .js-add-checklist': this.addChecklist,
        'submit .js-edit-checklist-title': this.editChecklist,
        'submit .js-add-checklist-item': this.addChecklistItem,
        'submit .js-edit-checklist-item': this.editChecklistItem,
        'click .js-convert-checklist-item-to-card': Popup.open('convertChecklistItemToCard'),
        'click .js-delete-checklist-item': this.deleteItem,
        'click .confirm-checklist-delete': this.deleteChecklist,
        'focus .js-add-checklist-item': this.focusChecklistItem,
        // add and delete checklist / checklist-item
        'click .js-open-inlined-form': this.closeAllInlinedForms,
        keydown: this.pressKey,
      },
    ];
  },
}).register('checklists');

BlazeComponent.extendComponent({
  onCreated() {
    subManager.subscribe('board', Session.get('currentBoard'), false);
    this.selectedBoardId = new ReactiveVar(Session.get('currentBoard'));
  },

  boards() {
    return Boards.find(
      {
        archived: false,
        'members.userId': Meteor.userId(),
        _id: { $ne: Meteor.user().getTemplatesBoardId() },
      },
      {
        sort: { sort: 1 /* boards default sorting */ },
      },
    );
  },

  swimlanes() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.swimlanes();
  },

  aBoardLists() {
    const board = Boards.findOne(this.selectedBoardId.get());
    return board.lists();
  },

  events() {
    return [
      {
        'change .js-select-boards'(event) {
          this.selectedBoardId.set($(event.currentTarget).val());
          subManager.subscribe('board', this.selectedBoardId.get(), false);
        },
      },
    ];
  },
}).register('boardsSwimlanesAndLists');

Template.checklists.helpers({
  checklists() {
    const card = Cards.findOne(this.cardId);
    const ret = card.checklists();
    return ret;
  },
  hideCheckedItems() {
    const currentUser = Meteor.user();
    if (currentUser) return currentUser.hasHideCheckedItems();
    return false;
  },
});

Template.addChecklistItemForm.onRendered(() => {
  autosize($('textarea.js-add-checklist-item'));
});

Template.editChecklistItemForm.onRendered(() => {
  autosize($('textarea.js-edit-checklist-item'));
});

Template.checklistDeleteDialog.onCreated(() => {
  const $cardDetails = this.$('.card-details');
  this.scrollState = {
    position: $cardDetails.scrollTop(), //save current scroll position
    top: false, //required for smooth scroll animation
  };
  //Callback's purpose is to only prevent scrolling after animation is complete
  $cardDetails.animate({ scrollTop: 0 }, 500, () => {
    this.scrollState.top = true;
  });

  //Prevent scrolling while dialog is open
  $cardDetails.on('scroll', () => {
    if (this.scrollState.top) {
      //If it's already in position, keep it there. Otherwise let animation scroll
      $cardDetails.scrollTop(0);
    }
  });
});

Template.checklistDeleteDialog.onDestroyed(() => {
  const $cardDetails = this.$('.card-details');
  $cardDetails.off('scroll'); //Reactivate scrolling
  $cardDetails.animate({ scrollTop: this.scrollState.position });
});

Template.checklistItemDetail.helpers({
  canModifyCard() {
    return (
      Meteor.user() &&
      Meteor.user().isBoardMember() &&
      !Meteor.user().isCommentOnly() &&
      !Meteor.user().isWorker()
    );
  },
  hideCheckedItems() {
    const user = Meteor.user();
    if (user) return user.hasHideCheckedItems();
    return false;
  },
});

BlazeComponent.extendComponent({
  toggleItem() {
    const checklist = this.currentData().checklist;
    const item = this.currentData().item;
    if (checklist && item && item._id) {
      item.toggleItem();
    }
  },
  events() {
    return [
      {
        'click .js-checklist-item .check-box-container': this.toggleItem,
      },
    ];
  },
}).register('checklistItemDetail');
