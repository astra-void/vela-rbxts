/// <reference types="@rbxts/types" />
/// <reference types="@rbxts/react" />

declare namespace JSX {
	interface IntrinsicElements {
		frame: React.InstanceProps<Frame> & { className?: string };
		scrollingframe: React.InstanceProps<ScrollingFrame> & { className?: string };
		canvasgroup: React.InstanceProps<CanvasGroup> & { className?: string };
		textlabel: React.InstanceProps<TextLabel> & { className?: string };
		textbutton: React.InstanceProps<TextButton> & { className?: string };
		textbox: React.InstanceProps<TextBox> & { className?: string };
		imagelabel: React.InstanceProps<ImageLabel> & { className?: string };
		imagebutton: React.InstanceProps<ImageButton> & { className?: string };
		uipadding: React.InstanceProps<UIPadding> & { className?: string };
		uicorner: React.InstanceProps<UICorner> & { className?: string };
		uistroke: React.InstanceProps<UIStroke> & { className?: string };
		uilistlayout: React.InstanceProps<UIListLayout> & { className?: string };
		uigridlayout: React.InstanceProps<UIGridLayout> & { className?: string };
		uitablelayout: React.InstanceProps<UITableLayout> & { className?: string };
		uipagelayout: React.InstanceProps<UIPageLayout> & { className?: string };
		uiaspectratio: React.InstanceProps<UIAspectRatioConstraint> & { className?: string };
		uisizeconstraint: React.InstanceProps<UISizeConstraint> & { className?: string };
		uitextsize: React.InstanceProps<UITextSizeConstraint> & { className?: string };
		uiscale: React.InstanceProps<UIScale> & { className?: string };
		uigradient: React.InstanceProps<UIGradient> & { className?: string };
		viewportframe: React.InstanceProps<ViewportFrame> & { className?: string };
		videoframe: React.InstanceProps<VideoFrame> & { className?: string };
	}
}